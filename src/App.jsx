import React, { useState, useMemo, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { Search, TrendingUp, TrendingDown, Clock, BarChart2, MessageCircle, Gift, Bookmark, ArrowLeft, Star, ChevronUp, ChevronDown, Zap, Users, Heart, DollarSign, LogOut, User, Plus, PlusCircle, X, Sparkles, Briefcase, Award } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { INITIAL_MARKETS, calculateOdds, FRIENDS, BROS, HOES } from './data';
import { computeMarketEngine, STARTING_CASH, DAILY_ALLOWANCE, COST_PER_VOTE, ADMIN_NAME, DAILY_VOTE_LIMIT, STOCK_HYPE_LIMIT } from './marketEngine';
import { supabase } from './supabase';
import './index.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/* ═══════════════════════════════════════════════════════════
   USER SESSION SYSTEM
   - Each friend selects their name to "log in"
   - $10 starting capital for stocks & markets, +$10 more each day
   - Each vote costs $1
   - Real-time cloud sync via Supabase
   ═══════════════════════════════════════════════════════════ */

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function loadSession() {
  try {
    const raw = localStorage.getItem('capri-session-v2');
    if (!raw) return null;
    const session = JSON.parse(raw);
    // Reset balance if it's a new day
    if (session.day !== getTodayKey()) {
      session.day = getTodayKey();
      session.spent = 0;
      localStorage.setItem('capri-session-v2', JSON.stringify(session));
    }
    return session;
  } catch { return null; }
}

function saveSession(session) {
  localStorage.setItem('capri-session-v2', JSON.stringify(session));
}

function loadMarkets() {
  try {
    const raw = localStorage.getItem('capri-markets-v3');
    if (!raw) return INITIAL_MARKETS;
    const parsed = JSON.parse(raw);
    // If the saved data doesn't have the new 'history' field, overwrite it with fresh data
    if (!parsed || parsed.length === 0 || !parsed[0].history) {
      return INITIAL_MARKETS;
    }
    return parsed;
  } catch { return INITIAL_MARKETS; }
}

function saveMarkets(markets) {
  localStorage.setItem('capri-markets-v3', JSON.stringify(markets));
}

function loadStocks(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

function saveStocks(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

/* ── Session Context ────────────────────────────────────── */
const SessionCtx = createContext(null);

function useSession() {
  return useContext(SessionCtx);
}

/* ── Login Screen ───────────────────────────────────────── */
function LoginScreen({ onLogin }) {
  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-logo">
          <TrendingUp size={36} color="#1d9bf0" />
          <h1>Capri Market</h1>
        </div>
        <p className="login-subtitle">Selecciona tu nombre para entrar al mercado</p>
        <p className="login-budget-info">
          <DollarSign size={16} /> Recibes <strong>${STARTING_CASH}</strong> de capital para operar en bolsa y votar, más <strong>${DAILY_ALLOWANCE}</strong> extra cada día, y <strong>{STOCK_HYPE_LIMIT} clicks de Hype</strong> por día
        </p>
        <div className="login-grid">
          {FRIENDS.map((name) => (
            <button
              key={name}
              className="login-friend-btn"
              onClick={() => onLogin(name)}
            >
              <div className="login-avatar">{name.charAt(0)}</div>
              <span>{name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Tiny inline Sparkline (canvas) ─────────────────────── */
function Sparkline({ data, color, width = 80, height = 32 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cvs.width = width * dpr;
    cvs.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);

    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, [data, color, width, height]);

  return <canvas ref={ref} style={{ width, height, display: 'block' }} />;
}

/* ── Header ─────────────────────────────────────────────── */
function Header({ currentPage, onNavigate, onOpenCreate, createdTodayCount = 0, userPortfolio }) {
  const { session, logout } = useSession();
  const netWorth = userPortfolio?.netWorth ?? STARTING_CASH;
  const cash = userPortfolio?.cash ?? STARTING_CASH;
  const profit = userPortfolio?.totalProfit ?? 0;
  const profitPercent = userPortfolio?.totalProfitPercent ?? 0;
  const isUp = profit >= 0;
  const hypeRemaining = userPortfolio?.hypeClicksRemaining ?? STOCK_HYPE_LIMIT;

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo" onClick={() => onNavigate('markets')}>
          <TrendingUp size={24} color="#1d9bf0" />
          Capri Market
        </div>
        <div className="search-bar">
          <Search size={18} />
          <input type="text" placeholder="Buscar mercados, bros, hoes..." />
        </div>
      </div>
      <div className="header-right">
        <button
          className="btn-create-poll"
          onClick={onOpenCreate}
          title={createdTodayCount >= 2 ? "Límite diario alcanzado (máx 2 por día)" : "Crear nueva votación"}
        >
          <PlusCircle size={16} />
          <span>Crear Votación</span>
          <span className={`poll-quota-chip ${createdTodayCount >= 2 ? 'full' : ''}`}>
            {createdTodayCount}/2
          </span>
        </button>

        {/* Real Market Financial Badges */}
        <div className="header-financials" title="Tu estado financiero en Capri Market">
          <div className="financial-item">
            <span className="financial-label">Patrimonio</span>
            <span className="financial-value">${netWorth.toFixed(2)}</span>
          </div>
          <div className="financial-divider" />
          <div className="financial-item">
            <span className="financial-label">Rentabilidad</span>
            <span className={`financial-value ${isUp ? 'up' : 'down'}`}>
              {isUp ? '+' : ''}{profitPercent}%
            </span>
          </div>
          <div className="financial-divider" />
          <div className="financial-item">
            <span className="financial-label">Efectivo</span>
            <span className="financial-value">${cash.toFixed(2)}</span>
          </div>
          <div className="financial-divider" />
          <div className="financial-item">
            <span className="financial-label">Hype (Gratis)</span>
            <span className={`financial-value ${hypeRemaining <= 0 ? 'down' : ''}`}>{hypeRemaining}/{STOCK_HYPE_LIMIT}</span>
          </div>
        </div>

        <div className="header-user">
          <div className="header-avatar">{session.name.charAt(0)}</div>
          <span className="header-username">{session.name}</span>
        </div>
        <button className="btn-logout" onClick={logout} title="Cerrar sesión">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

/* ── Nav ────────────────────────────────────────────────── */
function NavCategories({ currentPage, onNavigate, activeCategory, onSelectCategory }) {
  const items = [
    { key: 'markets', category: 'Todos', label: '🔥 Tendencia' },
    { key: 'acciones', category: null, label: '📈 Bolsa (Bros & Hoes)' },
    { key: 'markets', category: 'Fiesta', label: '🎉 Fiesta' },
    { key: 'markets', category: 'Salseo', label: '😈 Salseo' },
    { key: 'markets', category: 'Random', label: '🤔 Random' }
  ];

  return (
    <div className="nav-categories">
      {items.map((item, i) => {
        const isActive = (item.key === 'acciones' && currentPage === 'acciones') ||
          (item.key === 'markets' && currentPage === 'markets' && (activeCategory === item.category || (!activeCategory && item.category === 'Todos')));
        return (
          <div
            key={i}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => {
              onNavigate(item.key);
              if (item.category && onSelectCategory) {
                onSelectCategory(item.category);
              }
            }}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

/* ── Sidebar (Markets page) ─────────────────────────────── */
function Sidebar({ markets = [], activeCategory = 'Todos', onSelectCategory }) {
  const items = [
    { name: "Todos los mercados", category: "Todos", count: markets.length },
    { name: "Salseo", category: "Salseo", count: markets.filter(m => m.category === 'Salseo').length },
    { name: "Fiesta", category: "Fiesta", count: markets.filter(m => m.category === 'Fiesta').length },
    { name: "Tendencia", category: "Tendencia", count: markets.filter(m => m.category === 'Tendencia').length },
    { name: "Random", category: "Random", count: markets.filter(m => m.category === 'Random').length }
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-menu">
        {items.map((item, i) => {
          const isActive = activeCategory === item.category;
          return (
            <div
              key={i}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectCategory && onSelectCategory(item.category)}
            >
              <span>{item.name}</span>
              <span className="sidebar-badge">{item.count}</span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/* ── Acciones Sidebar ───────────────────────────────────── */
function AccionesSidebar({ activeTab, onTabChange, portfolioCount = 0 }) {
  const items = [
    { key: 'discover', name: 'Descubrir', icon: <Zap size={16} /> },
    { key: 'portfolio', name: 'Mi Cartera', icon: <Briefcase size={16} />, badge: portfolioCount > 0 ? portfolioCount : null },
    { key: 'leaderboard', name: 'Wall St Capri', icon: <Award size={16} /> },
    { key: 'ranking', name: 'Clasificación', icon: <Star size={16} /> },
  ];
  const assets = [
    { key: 'all', name: 'Todos los activos', count: BROS.length + HOES.length },
    { key: 'bros', name: 'Bros', count: BROS.length, icon: <Users size={16} /> },
    { key: 'hoes', name: 'Hoes', count: HOES.length, icon: <Heart size={16} /> },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-menu">
        {items.map((item) => (
          <div
            key={item.key}
            className={`sidebar-item ${activeTab === item.key ? 'active' : ''}`}
            onClick={() => onTabChange(item.key)}
          >
            <span className="flex-center">{item.icon} {item.name}</span>
            {item.badge && <span className="sidebar-badge" style={{ background: '#22c55e', color: 'white' }}>{item.badge}</span>}
          </div>
        ))}
      </div>
      <div style={{ padding: '16px 16px 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Activos
      </div>
      <div className="sidebar-menu">
        {assets.map((item) => (
          <div
            key={item.key}
            className={`sidebar-item ${activeTab === item.key ? 'active' : ''}`}
            onClick={() => onTabChange(item.key)}
          >
            <span className="flex-center">{item.icon} {item.name}</span>
            <span className="sidebar-badge">{item.count}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ── Trade Modal (Terminal de Operaciones) ───────────────── */
function TradeModal({ stock, userPortfolio, isOpen, onClose, onTrade }) {
  const [action, setAction] = useState('BUY'); // 'BUY' | 'SELL'
  const [amountStr, setAmountStr] = useState('10');
  const [submitting, setSubmitting] = useState(false);

  // Default buy amount can't exceed what the user actually has, otherwise the
  // modal opens already showing "Saldo insuficiente" even though they do have cash.
  const defaultBuyAmount = (cash) => {
    const safeCash = Math.max(0, cash || 0);
    return String(Math.min(10, +safeCash.toFixed(2)));
  };

  useEffect(() => {
    if (isOpen) {
      setAction('BUY');
      setAmountStr(defaultBuyAmount(userPortfolio?.cash));
    }
  }, [isOpen, stock]);

  if (!isOpen || !stock) return null;

  const currentPrice = stock.price;
  const holding = userPortfolio?.positions?.find(p => p.stockId === stock.id) || null;
  const ownedShares = holding ? holding.shares : 0;
  const ownedValue = +(ownedShares * currentPrice).toFixed(2);
  const availableCash = userPortfolio ? userPortfolio.cash : 0;

  const numAmount = parseFloat(amountStr) || 0;
  const estimatedShares = action === 'BUY'
    ? (currentPrice > 0 ? +(numAmount / currentPrice).toFixed(4) : 0)
    : (currentPrice > 0 ? Math.min(ownedShares, +(numAmount / currentPrice).toFixed(4)) : 0);

  const isBuyValid = action === 'BUY' && numAmount > 0 && numAmount <= (availableCash + 0.001);
  const isSellValid = action === 'SELL' && numAmount > 0 && numAmount <= (ownedValue + 0.05);
  const isValid = action === 'BUY' ? isBuyValid : isSellValid;

  const handleQuickChip = (val) => {
    if (action === 'BUY') {
      if (val === 'MAX') setAmountStr(String(Math.floor(availableCash)));
      else setAmountStr(String(Math.min(val, +availableCash.toFixed(2))));
    } else {
      if (val === 'ALL') setAmountStr(String(ownedValue));
      else if (val === 'HALF') setAmountStr(String(+(ownedValue * 0.5).toFixed(2)));
      else setAmountStr(String(Math.min(ownedValue, val)));
    }
  };

  const handleConfirm = () => {
    if (!isValid || submitting) return;
    setSubmitting(true);

    const finalAmount = Math.min(numAmount, action === 'BUY' ? availableCash : ownedValue);
    const finalShares = action === 'BUY'
      ? +(finalAmount / currentPrice).toFixed(4)
      : (finalAmount >= ownedValue - 0.05 ? ownedShares : +(finalAmount / currentPrice).toFixed(4));

    onTrade({
      stockId: stock.id,
      action,
      amount: finalAmount,
      shares: finalShares,
      price: currentPrice
    });

    setSubmitting(false);
    onClose();
  };

  return (
    <div className="trade-modal-overlay" onClick={onClose}>
      <div className="trade-modal-card" onClick={e => e.stopPropagation()}>
        <div className="trade-modal-header">
          <div className="trade-header-info">
            <div className="trade-header-emoji">{stock.emoji}</div>
            <div>
              <div className="trade-header-title">
                {stock.ticker} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>• {stock.name}</span>
              </div>
              <div className="trade-header-sub">
                {stock.type === 'bro' ? 'Bro Asset' : 'Hoe Speculative Asset'} • {stock.leverage}x Apalancamiento
              </div>
            </div>
          </div>
          <button className="btn-close-modal" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="trade-tabs">
          <button
            className={`trade-tab-btn buy ${action === 'BUY' ? 'active' : ''}`}
            onClick={() => { setAction('BUY'); setAmountStr(defaultBuyAmount(availableCash)); }}
          >
            Comprar 🟢
          </button>
          <button
            className={`trade-tab-btn sell ${action === 'SELL' ? 'active' : ''}`}
            onClick={() => { setAction('SELL'); setAmountStr(ownedValue > 0 ? String(ownedValue) : '0'); }}
          >
            Vender 🔴 {ownedShares > 0 ? `(${ownedShares} acc)` : ''}
          </button>
        </div>

        <div className="trade-modal-body">
          <div className="trade-price-strip">
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Precio de Mercado
              </div>
              <div className="trade-current-price">
                ${currentPrice.toFixed(2)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`featured-change ${stock.change >= 0 ? 'up' : 'down'}`} style={{ fontSize: 14 }}>
                {stock.change >= 0 ? '+' : ''}{stock.change}%
              </span>
              <div style={{ marginTop: 2 }}>
                <span className="trade-leverage-tag">
                  <Zap size={11} /> {stock.leverage}x
                </span>
              </div>
            </div>
          </div>

          <div className="trade-input-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
              <span>{action === 'BUY' ? 'Monto a invertir' : 'Monto a retirar'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {action === 'BUY'
                  ? `Disponible: $${availableCash.toFixed(2)}`
                  : `En cartera: $${ownedValue.toFixed(2)} (${ownedShares} acc)`}
              </span>