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
import { computeMarketEngine, STARTING_CASH, DAILY_ALLOWANCE, COST_PER_VOTE, ADMIN_NAME, DAILY_VOTE_LIMIT } from './marketEngine';
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
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
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
          <DollarSign size={16} /> Recibes <strong>${STARTING_CASH}</strong> de capital para operar en bolsa y votar, más <strong>${DAILY_ALLOWANCE}</strong> extra cada día, y <strong>{DAILY_VOTE_LIMIT} votos</strong> por día para las votaciones
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
  const votesRemaining = userPortfolio?.votesRemainingToday ?? DAILY_VOTE_LIMIT;

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
            <span className="financial-label">Votos hoy</span>
            <span className={`financial-value ${votesRemaining <= 0 ? 'down' : ''}`}>{votesRemaining}/{DAILY_VOTE_LIMIT}</span>
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
            </div>

            <div className="trade-input-row">
              <span className="trade-input-prefix">$</span>
              <input
                type="number"
                step="any"
                min="0"
                className="trade-amount-input"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>

            <div className="trade-quick-chips">
              {action === 'BUY' ? (
                <>
                  <button className="quick-chip" onClick={() => handleQuickChip(5)}>+$5</button>
                  <button className="quick-chip" onClick={() => handleQuickChip(10)}>+$10</button>
                  <button className="quick-chip" onClick={() => handleQuickChip(25)}>+$25</button>
                  <button className="quick-chip" onClick={() => handleQuickChip('MAX')}>TODO (${Math.floor(availableCash)})</button>
                </>
              ) : (
                <>
                  <button className="quick-chip" onClick={() => handleQuickChip('HALF')}>50%</button>
                  <button className="quick-chip" onClick={() => handleQuickChip('ALL')}>100% (Vender todo)</button>
                </>
              )}
            </div>
          </div>

          <div className="trade-details-panel">
            <div className="trade-detail-row">
              <span>Acciones a {action === 'BUY' ? 'recibir' : 'entregar'}:</span>
              <span>{estimatedShares} {stock.ticker}</span>
            </div>
            <div className="trade-detail-row">
              <span>Precio por acción:</span>
              <span>${currentPrice.toFixed(2)}</span>
            </div>
            <div className="trade-detail-row">
              <span>Nuevo saldo disponible:</span>
              <span>
                ${action === 'BUY' 
                  ? Math.max(0, availableCash - numAmount).toFixed(2) 
                  : (availableCash + numAmount).toFixed(2)}
              </span>
            </div>
            {holding && action === 'SELL' && (
              <div className="trade-detail-row">
                <span>Rendimiento de tu posición:</span>
                <span style={{ color: holding.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {holding.pnl >= 0 ? '+' : ''}${holding.pnl.toFixed(2)} ({holding.pnlPercent}%)
                </span>
              </div>
            )}
          </div>

          <button
            className={`btn-confirm-trade ${action === 'BUY' ? 'buy' : 'sell'}`}
            disabled={!isValid || submitting}
            onClick={handleConfirm}
          >
            {action === 'BUY' 
              ? (numAmount > availableCash ? 'Saldo insuficiente' : `Comprar $${numAmount.toFixed(2)} de ${stock.ticker}`)
              : (numAmount > ownedValue ? 'Supera tu cartera' : `Vender ${estimatedShares} acc ($${numAmount.toFixed(2)})`)}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Portfolio Banner ───────────────────────────────────── */
function PortfolioBanner({ userPortfolio, onTabChange }) {
  const isUp = userPortfolio.totalProfit >= 0;
  return (
    <div className="portfolio-banner">
      <div className="portfolio-stat">
        <span className="portfolio-stat-label">Patrimonio Total</span>
        <span className="portfolio-stat-value">${userPortfolio.netWorth.toFixed(2)}</span>
        <span className={`portfolio-stat-sub ${isUp ? 'up' : 'down'}`}>
          {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {isUp ? '+' : ''}${userPortfolio.totalProfit.toFixed(2)} ({isUp ? '+' : ''}{userPortfolio.totalProfitPercent}%)
        </span>
      </div>
      <div className="portfolio-stat">
        <span className="portfolio-stat-label">Efectivo Disponible</span>
        <span className="portfolio-stat-value">${userPortfolio.cash.toFixed(2)}</span>
        <span className="portfolio-stat-sub" style={{ color: '#94a3b8' }}>
          Para operar o votar
        </span>
      </div>
      <div className="portfolio-stat">
        <span className="portfolio-stat-label">Invertido en Acciones</span>
        <span className="portfolio-stat-value">${userPortfolio.stocksValue.toFixed(2)}</span>
        <span className="portfolio-stat-sub" style={{ color: '#94a3b8' }}>
          {userPortfolio.positions.length} posiciones abiertas
        </span>
      </div>
      <div className="portfolio-stat" style={{ justifyContent: 'center' }}>
        <button
          className="btn-modal-submit"
          style={{ padding: '8px 16px', fontSize: 13, alignSelf: 'flex-start' }}
          onClick={() => onTabChange('portfolio')}
        >
          Ver Mi Cartera 💼
        </button>
      </div>
    </div>
  );
}

/* ── Portfolio View ─────────────────────────────────────── */
function PortfolioView({ userPortfolio, onTradeClick, onExploreClick }) {
  if (!userPortfolio.positions || userPortfolio.positions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>💼</div>
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Tu cartera está vacía</h3>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 460, margin: '0 auto 24px', fontSize: 14 }}>
          Aún no has comprado acciones de Bros o Hoes. Utiliza tu saldo disponible de <strong>${userPortfolio.cash.toFixed(2)}</strong> para comprar antes de que las votaciones de los amigos hagan subir los precios.
        </p>
        <button className="btn-modal-submit" onClick={onExploreClick}>
          Explorar y Operar Acciones 🚀
        </button>
      </div>
    );
  }

  return (
    <div>
      <h3 className="subsection-title">Tus Posiciones Abiertas 📈</h3>
      <div className="positions-grid">
        {userPortfolio.positions.map(pos => {
          const isUp = pos.pnl >= 0;
          return (
            <div key={pos.stockId} className="position-card">
              <div className="position-header">
                <div className="position-stock-title">
                  <span style={{ fontSize: 24 }}>{pos.stock.emoji}</span>
                  <div>
                    <div>{pos.stock.ticker}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{pos.stock.name}</div>
                  </div>
                </div>
                <span className={`featured-change ${isUp ? 'up' : 'down'}`} style={{ fontSize: 14 }}>
                  {isUp ? '+' : ''}${pos.pnl.toFixed(2)} ({isUp ? '+' : ''}{pos.pnlPercent}%)
                </span>
              </div>

              <div className="position-metrics">
                <div className="position-metric-item">
                  <span className="position-metric-label">Acciones</span>
                  <span className="position-metric-val">{pos.shares}</span>
                </div>
                <div className="position-metric-item">
                  <span className="position-metric-label">Precio Actual</span>
                  <span className="position-metric-val">${pos.stock.price.toFixed(2)}</span>
                </div>
                <div className="position-metric-item">
                  <span className="position-metric-label">Precio Medio</span>
                  <span className="position-metric-val">${pos.avgBuyPrice.toFixed(2)}</span>
                </div>
                <div className="position-metric-item">
                  <span className="position-metric-label">Valor Total</span>
                  <span className="position-metric-val" style={{ color: 'var(--accent-blue)' }}>${pos.currentValue.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  className="btn-position-sell"
                  onClick={() => onTradeClick(pos.stock, 'SELL')}
                >
                  Vender 🔴
                </button>
                <button
                  className="btn-trade-stock"
                  style={{ width: 'auto', padding: 8 }}
                  onClick={() => onTradeClick(pos.stock, 'BUY')}
                >
                  Comprar más 🟢
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Leaderboard View (Wall Street Capri) ────────────────── */
function LeaderboardView({ leaderboard, currentUserName }) {
  return (
    <div className="trader-leaderboard-card">
      <div className="leaderboard-header">
        <div className="leaderboard-title">
          <span>🏆 Wall Street Capri — Ranking de Brokers</span>
        </div>
        <p className="leaderboard-subtitle">
          Los amigos de Capri compiten por la mayor rentabilidad del mercado. ¡Compra y vende en el momento oportuno!
        </p>
      </div>
      <div className="leaderboard-table">
        <div className="leaderboard-row leaderboard-row-head">
          <span>#</span>
          <span>Amigo / Trader</span>
          <span>Patrimonio</span>
          <span>Rentabilidad (ROI)</span>
          <span>Posiciones</span>
        </div>
        {leaderboard.map(trader => {
          const isCurrentUser = trader.name === currentUserName;
          const isUp = trader.totalProfit >= 0;
          return (
            <div key={trader.name} className={`leaderboard-row ${isCurrentUser ? 'current-user-row' : ''}`}>
              <div className="trader-rank-cell">
                {trader.badge} {trader.rank}
              </div>
              <div className="trader-identity">
                <div className="trader-avatar-box">
                  {trader.name.charAt(0)}
                </div>
                <div className="trader-name-box">
                  <span className="trader-name">
                    {trader.name} {isCurrentUser && '⭐ (Tú)'}
                  </span>
                  <span className="trader-tier-badge">
                    {trader.tier}
                  </span>
                </div>
              </div>
              <div className="trader-networth">
                ${trader.netWorth.toFixed(2)}
              </div>
              <div className={`trader-roi ${isUp ? 'up' : 'down'}`}>
                {isUp ? '+' : ''}${trader.totalProfit.toFixed(2)} ({isUp ? '+' : ''}{trader.totalProfitPercent}%)
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {trader.positions.length} activo(s) • {trader.tradesCount} trades
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Featured Stock Card (Destacados) ───────────────────── */
function FeaturedCard({ stock, onVote, onTrade, userHolding }) {
  const isUp = stock.change >= 0;
  const sharesOwned = userHolding?.shares || 0;

  return (
    <div className={`featured-card ${isUp ? 'featured-up' : 'featured-down'}`}>
      <div className="featured-top">
        <div className="featured-badge">
          <span className="featured-emoji">{stock.emoji}</span>
          <span className="featured-ticker">{stock.ticker}</span>
          {sharesOwned > 0 && (
            <span className="holding-badge-pill">x{sharesOwned}</span>
          )}
        </div>
        <Star size={18} className="featured-star" />
      </div>
      <div className="featured-name">{stock.name}</div>
      <div className="featured-chart">
        <Sparkline data={stock.sparkline} color={isUp ? '#00ba7c' : '#f91880'} width={120} height={48} />
      </div>
      <div className="featured-bottom">
        <span className="featured-price">${stock.price.toFixed(2)}</span>
        <span className={`featured-change ${isUp ? 'up' : 'down'}`}>
          {isUp ? '+' : ''}{stock.change}%
        </span>
        <span className="featured-leverage">{stock.leverage}x</span>
      </div>
      <div className="card-actions-group">
        <button className="btn-trade-stock" onClick={() => onTrade(stock, 'BUY')}>
          <Zap size={14} /> Operar
        </button>
        <button className="btn-vote-stock-secondary" onClick={() => onVote(stock.id)} title="Votar acción">
          <ChevronUp size={14} /> {stock.votes > 0 ? stock.votes : ''}
        </button>
      </div>
    </div>
  );
}

/* ── Stock Row (Más subidas / bajadas) ──────────────────── */
function StockRow({ stock, rank, onVote, onTrade, userHolding }) {
  const isUp = stock.change >= 0;
  const sharesOwned = userHolding?.shares || 0;

  return (
    <div className="stock-row">
      {rank && <span className="stock-rank">{rank}</span>}
      <span className="stock-row-emoji">{stock.emoji}</span>
      <div className="stock-row-info">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="stock-row-ticker">{stock.ticker}</span>
          {sharesOwned > 0 && (
            <span className="holding-badge-pill">x{sharesOwned}</span>
          )}
        </div>
        <span className="stock-row-name">{stock.name}</span>
      </div>
      <div className="stock-row-spark">
        <Sparkline data={stock.sparkline} color={isUp ? '#00ba7c' : '#f91880'} width={60} height={28} />
      </div>
      <div className="stock-row-right">
        <span className="stock-row-price">${stock.price.toFixed(2)}</span>
        <span className={`stock-row-change ${isUp ? 'up' : 'down'}`}>
          {isUp ? '+' : ''}{stock.change}%
        </span>
      </div>
      <button className="btn-trade-stock" style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }} onClick={() => onTrade(stock, 'BUY')}>
        Operar
      </button>
      <button className="btn-vote-mini" onClick={() => onVote(stock.id)} title="Votar acción">
        <ChevronUp size={14} />
      </button>
    </div>
  );
}

/* ── Acciones Page ──────────────────────────────────────── */
function AccionesPage({ marketEngineData, onTrade, onStockVote }) {
  const { session } = useSession();
  const [activeTab, setActiveTab] = useState('discover');
  const [tradeModalStock, setTradeModalStock] = useState(null);

  const { bros, hoes, allStocks, leaderboard, userPortfolio } = marketEngineData;

  const topGainers = useMemo(() => [...allStocks].sort((a, b) => b.change - a.change).slice(0, 5), [allStocks]);
  const topLosers = useMemo(() => [...allStocks].sort((a, b) => a.change - b.change).slice(0, 5), [allStocks]);
  const featured = useMemo(() => [...allStocks].sort((a, b) => (b.votes + b.tradesCount) - (a.votes + a.tradesCount)).slice(0, 4), [allStocks]);

  const displayList = activeTab === 'bros' ? bros
    : activeTab === 'hoes' ? hoes
    : activeTab === 'ranking' ? [...allStocks].sort((a, b) => b.votes - a.votes)
    : null;

  const getHolding = (stockId) => {
    return userPortfolio?.positions?.find(p => p.stockId === stockId) || null;
  };

  const handleOpenTrade = (stock) => {
    setTradeModalStock(stock);
  };

  return (
    <main className="main-layout">
      <AccionesSidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        portfolioCount={userPortfolio?.positions?.length || 0} 
      />
      <div className="content">
        <div className="acciones-header-row">
          <div>
            <h2 className="section-title" style={{ marginBottom: 4 }}>Bolsa de Valores Capri 📈</h2>
            <p className="acciones-subtitle">Opera Bros y Hoes 24/7. Las votaciones impulsan los precios en tiempo real.</p>
          </div>
          <div className="search-bar" style={{ width: 240 }}>
            <Search size={16} />
            <input type="text" placeholder="Buscar activo..." />
          </div>
        </div>

        {/* Global Financial Banner for the User */}
        <PortfolioBanner userPortfolio={userPortfolio} onTabChange={setActiveTab} />

        {/* Tab: Mi Cartera */}
        {activeTab === 'portfolio' && (
          <PortfolioView 
            userPortfolio={userPortfolio} 
            onTradeClick={handleOpenTrade}
            onExploreClick={() => setActiveTab('discover')}
          />
        )}

        {/* Tab: Wall Street Capri Leaderboard */}
        {activeTab === 'leaderboard' && (
          <LeaderboardView 
            leaderboard={leaderboard} 
            currentUserName={session?.name}
          />
        )}

        {/* Tab: Discover */}
        {activeTab === 'discover' && (
          <>
            {/* Destacados */}
            <h3 className="subsection-title">Destacados del Momento ⭐</h3>
            <div className="featured-grid">
              {featured.map(s => (
                <FeaturedCard 
                  key={s.id} 
                  stock={s} 
                  onVote={onStockVote} 
                  onTrade={handleOpenTrade}
                  userHolding={getHolding(s.id)}
                />
              ))}
            </div>

            {/* Más subidas / bajadas */}
            <div className="gainers-losers">
              <div className="gl-col">
                <div className="gl-header">
                  <h3 className="subsection-title">Más subidas 🚀</h3>
                  <span className="gl-view-all" onClick={() => setActiveTab('all')}>Ver todo</span>
                </div>
                {topGainers.map((s, i) => (
                  <StockRow 
                    key={s.id} 
                    stock={s} 
                    rank={i + 1} 
                    onVote={onStockVote} 
                    onTrade={handleOpenTrade}
                    userHolding={getHolding(s.id)}
                  />
                ))}
              </div>
              <div className="gl-col">
                <div className="gl-header">
                  <h3 className="subsection-title">Más bajadas 📉</h3>
                  <span className="gl-view-all" onClick={() => setActiveTab('all')}>Ver todo</span>
                </div>
                {topLosers.map((s, i) => (
                  <StockRow 
                    key={s.id} 
                    stock={s} 
                    rank={i + 1} 
                    onVote={onStockVote} 
                    onTrade={handleOpenTrade}
                    userHolding={getHolding(s.id)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Tab: Ranking por votos */}
        {activeTab === 'ranking' && (
          <>
            <h3 className="subsection-title">Ranking por Votos y Popularidad 🏆</h3>
            <div className="ranking-table">
              <div className="ranking-header-row">
                <span>#</span>
                <span>Activo</span>
                <span>Precio</span>
                <span>Cambio</span>
                <span>Votos</span>
                <span>Acción</span>
              </div>
              {displayList.map((s, i) => (
                <div className="ranking-row" key={s.id}>
                  <span className="ranking-pos">{i + 1}</span>
                  <div className="ranking-asset">
                    <span className="stock-row-emoji">{s.emoji}</span>
                    <div>
                      <span className="stock-row-ticker">{s.ticker}</span>
                      <span className="stock-row-name">{s.name}</span>
                    </div>
                  </div>
                  <span className="ranking-price">${s.price.toFixed(2)}</span>
                  <span className={`stock-row-change ${s.change >= 0 ? 'up' : 'down'}`}>
                    {s.change >= 0 ? '+' : ''}{s.change}%
                  </span>
                  <span className="ranking-votes">{s.votes}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-trade-stock" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={() => handleOpenTrade(s)}>
                      Operar
                    </button>
                    <button className="btn-vote-mini" onClick={() => onStockVote(s.id)}>
                      <ChevronUp size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Tabs: Bros / Hoes / All */}
        {(activeTab === 'bros' || activeTab === 'hoes' || activeTab === 'all') && (
          <>
            <h3 className="subsection-title">
              {activeTab === 'bros' ? '🧑‍🤝‍🧑 Bros (Acciones de Amigos)' : activeTab === 'hoes' ? '💅 Hoes (Alta Volatilidad / 50x)' : '📋 Todos los activos'}
            </h3>
            <div className="stock-list-full">
              {(activeTab === 'all' ? allStocks : displayList).map((s, i) => {
                const holding = getHolding(s.id);
                return (
                  <div className="stock-full-row" key={s.id}>
                    <span className="stock-rank">{i + 1}</span>
                    <span className="stock-row-emoji">{s.emoji}</span>
                    <div className="stock-row-info">
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="stock-row-ticker">{s.ticker}</span>
                        {holding && <span className="holding-badge-pill">x{holding.shares}</span>}
                      </div>
                      <span className="stock-row-name">{s.name}</span>
                    </div>
                    <div className="stock-row-spark">
                      <Sparkline data={s.sparkline} color={s.change >= 0 ? '#00ba7c' : '#f91880'} width={80} height={32} />
                    </div>
                    <div className="stock-row-right">
                      <span className="stock-row-price">${s.price.toFixed(2)}</span>
                      <span className={`stock-row-change ${s.change >= 0 ? 'up' : 'down'}`}>
                        {s.change >= 0 ? '+' : ''}{s.change}%
                      </span>
                    </div>
                    <span className="stock-full-votes">{s.votes} votos</span>
                    <span className="stock-full-leverage">{s.leverage}x</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-trade-stock" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={() => handleOpenTrade(s)}>
                        Operar
                      </button>
                      <button className="btn-vote-mini" onClick={() => onStockVote(s.id)}>
                        <ChevronUp size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Floating / Contextual Trade Modal */}
      {tradeModalStock && (
        <TradeModal
          stock={tradeModalStock}
          userPortfolio={userPortfolio}
          isOpen={!!tradeModalStock}
          onClose={() => setTradeModalStock(null)}
          onTrade={onTrade}
        />
      )}
    </main>
  );
}

/* ── Market Card ────────────────────────────────────────── */
function MarketCard({ market, onVote, onClick }) {
  const calculatedOptions = calculateOdds(market.options).slice(0, 2);
  const resolution = market.resolution;

  return (
    <div className="market-card" onClick={() => onClick(market)}>
      <div className="card-header">
        <div className="card-icon">{market.emoji || '🎭'}</div>
        <div className="card-title">
          {market.title}
          {market.author && <span className="market-author-tag">Por {market.author}</span>}
          {resolution && <span className="market-resolved-tag">🏆 Resuelta: {resolution.winningOption}</span>}
        </div>
      </div>
      <div className="card-options">
        {calculatedOptions.map((opt, i) => (
          <div className="option-row" key={i}>
            <div className="option-name">{opt.name}</div>
            <div className="option-actions">
              <span className="option-prob">{opt.percentage}</span>
              {!resolution && (
                <button
                  className={`btn-vote ${market.options.length === 2 ? (i === 0 ? 'yes' : 'no') : 'buy'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onVote(market.id, opt.name);
                  }}
                >
                  {market.options.length === 2 ? (i === 0 ? 'Sí' : 'No') : '$1'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="card-footer">
        <div className="flex-center">
          <Clock size={14} /> {market.endDate}
        </div>
        <div className="flex-center">
          {market.volume}
        </div>
        <div className="flex-center">
          <MessageCircle size={14} /> <Gift size={14} /> <Bookmark size={14} />
        </div>
      </div>
    </div>
  );
}

/* ── Hero Market (Tendencia) ────────────────────────────── */
function HeroMarket({ market, onVote, onClick }) {
  if (!market || !market.history) return null;

  const calculatedOptions = calculateOdds(market.options).slice(0, 4); // Top 4 for display
  const isBinary = market.options.length === 2;
  const resolution = market.resolution;

  // Render chart from real history
  const labels = market.history.map(h => h.label);
  const colors = ['#1d9bf0', '#00ba7c', '#f91880', '#fbbf24'];
  const datasets = calculatedOptions.slice(0, 3).map((opt, i) => ({
    label: opt.name,
    data: market.history.map(h => h.data[opt.name] || 0),
    borderColor: colors[i % colors.length],
    backgroundColor: i === 0 ? 'rgba(29, 155, 240, 0.1)' : 'transparent',
    fill: i === 0,
    tension: 0.2,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
  }));

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
    scales: { 
      y: { min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { borderDash: [4, 4] } },
      x: { grid: { display: false } }
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  };

  return (
    <div className="hero-market-card" onClick={() => onClick(market)}>
      <div className="hero-market-header">
        <div className="hero-market-icon">{market.emoji || '🎭'}</div>
        <div>
          <div className="hero-market-category">{market.category}</div>
          <h1 className="hero-market-title">{market.title}</h1>
        </div>
        <div className="hero-market-actions">
          <Bookmark size={20} />
        </div>
      </div>
      
      <div className="hero-market-body">
        <div className="hero-market-options">
          {calculatedOptions.map((opt, i) => (
            <div className="hero-option-row" key={i}>
              <div className="hero-option-left">
                <span className="hero-option-date">{market.endDate}</span>
                <span className="hero-option-prob">{opt.percentage}</span>
              </div>
              <div className="hero-option-name" style={{color: colors[i % colors.length]}}>
                ● {opt.name} {resolution?.winningOption === opt.name && '🏆'}
              </div>
              {!resolution && (
                <button
                  className={`btn-vote ${isBinary ? (i === 0 ? 'yes' : 'no') : 'buy'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onVote(market.id, opt.name);
                  }}
                >
                  {isBinary ? (i === 0 ? 'Sí' : 'No') : 'Comprar'} · $1
                </button>
              )}
            </div>
          ))}

          <div className="hero-market-footer">
            {resolution ? (
              <span className="flex-center">🏆 Resuelta: {resolution.winningOption}</span>
            ) : (
              <span className="flex-center"><img src="https://ui-avatars.com/api/?name=Capri&background=random&rounded=true" width="20" height="20" alt="avatar"/> Capri Admin</span>
            )}
            <span style={{color: 'var(--text-secondary)'}}>{market.volume} Vol</span>
          </div>
        </div>
        
        <div className="hero-market-chart">
          <Line data={{labels, datasets}} options={options} />
        </div>
      </div>
    </div>
  );
}

/* ── Market Detail ──────────────────────────────────────── */
function MarketDetail({ market, onVote, onBack, isAdmin, onResolve }) {
  const [pickedWinner, setPickedWinner] = useState('');
  const calculatedOptions = calculateOdds(market.options);
  const colors = ['#1d9bf0', '#00ba7c', '#f91880', '#fbbf24', '#8b5cf6'];
  const resolution = market.resolution;

  const labels = market.history.map(h => h.label);
  const datasets = calculatedOptions.slice(0, 3).map((opt, i) => ({
    label: opt.name,
    data: market.history.map(h => h.data[opt.name] || 0),
    borderColor: colors[i % colors.length],
    backgroundColor: i === 0 ? 'rgba(29, 155, 240, 0.1)' : 'transparent',
    fill: i === 0,
    tension: 0.2
  }));

  const chartData = { labels, datasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } }
  };

  return (
    <div className="detail-view">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={16} /> Volver
      </button>

      <div className="detail-header">
        <div>
          <div className="flex-center" style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '14px', gap: '8px' }}>
            <span>{market.category} • Finaliza {market.endDate}</span>
            {market.author && <span className="market-author-tag">Creado por {market.author}</span>}
          </div>
          <h1 className="detail-title">{market.title}</h1>
        </div>
        <div className="detail-meta">
          <div className="flex-center"><BarChart2 size={16} /> {market.volume}</div>
          <Bookmark size={20} style={{ cursor: 'pointer' }} />
        </div>
      </div>

      <div className="chart-container">
        <Line data={chartData} options={options} />
      </div>

      {resolution && (
        <div className="market-resolution-banner">
          🏆 Votación resuelta: ganó <strong>"{resolution.winningOption}"</strong>
          {resolution.winnersCount > 0 ? (
            <> — se repartieron <strong>${resolution.pot}</strong> entre {resolution.winnersCount} ganador{resolution.winnersCount === 1 ? '' : 'es'} (${resolution.payoutPerVote} c/u)</>
          ) : (
            <> — nadie votó la opción ganadora, no hubo pagos</>
          )}
        </div>
      )}

      <h3 style={{ marginBottom: '16px', fontSize: '20px' }}>Opciones</h3>
      <div className="detail-options-grid">
        {calculatedOptions.map((opt, i) => {
          const isWinner = resolution && resolution.winningOption === opt.name;
          return (
            <div className="detail-option-card" key={i} style={resolution ? { opacity: isWinner ? 1 : 0.5 } : undefined}>
              <div className="detail-option-header">
                <div className="avatar" style={{background: colors[i % colors.length]}}>{opt.name.charAt(0)}</div>
                <div className="detail-option-name">{opt.name} {isWinner && '🏆'}</div>
              </div>
              <div className="detail-option-stats">
                <div className="stat-box">
                  <span className="stat-label">Probabilidad</span>
                  <span className="stat-value" style={{ color: colors[i % colors.length] }}>{opt.percentage}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Pago</span>
                  <span className="stat-value">{opt.payout}x</span>
                </div>
              </div>
              {!resolution && (
                <button
                  className="btn-buy-large"
                  style={{background: colors[i % colors.length]}}
                  onClick={() => onVote(market.id, opt.name)}
                >
                  Comprar {opt.name} · $1
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && !resolution && (
        <div className="admin-resolve-panel">
          <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>⚙️ Admin: Resolver votación</h3>
          <select
            className="admin-resolve-select"
            value={pickedWinner}
            onChange={(e) => setPickedWinner(e.target.value)}
          >
            <option value="">Elegir opción ganadora...</option>
            {market.options.map((opt) => (
              <option key={opt.name} value={opt.name}>{opt.name}</option>
            ))}
          </select>
          <button
            className="btn-buy-large"
            style={{ background: '#1d9bf0', marginTop: '8px' }}
            disabled={!pickedWinner}
            onClick={() => {
              if (window.confirm(`¿Confirmás que "${pickedWinner}" ganó esta votación? Esta acción es irreversible y pagará a los ganadores.`)) {
                onResolve(market.id, pickedWinner);
              }
            }}
          >
            Resolver votación
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Toast notification ─────────────────────────────────── */
function Toast({ message, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className={`toast toast-${type}`}>
      {type === 'error' ? '⚠️' : '✅'} {message}
    </div>
  );
}

/* ── Modal: Crear Votación ───────────────────────────────── */
function CreateMarketModal({ isOpen, onClose, onCreate, createdTodayCount }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Fiesta');
  const [emoji, setEmoji] = useState('🍻');
  const [optionMode, setOptionMode] = useState('friends'); // 'friends' | 'yesno' | 'custom'
  const [customOptions, setCustomOptions] = useState(['', '']);

  if (!isOpen) return null;

  const canCreate = createdTodayCount < 2;

  const quickEmojis = ['🍻', '🎉', '🥴', '🔥', '💀', '📱', '😈', '👑', '🍕', '🎯', '💃'];
  const categories = ['Fiesta', 'Salseo', 'Tendencia', 'Random'];

  const handleAddCustomOption = () => {
    if (customOptions.length < 8) {
      setCustomOptions([...customOptions, '']);
    }
  };

  const handleRemoveCustomOption = (index) => {
    if (customOptions.length > 2) {
      setCustomOptions(customOptions.filter((_, i) => i !== index));
    }
  };

  const handleCustomOptionChange = (index, value) => {
    const updated = [...customOptions];
    updated[index] = value;
    setCustomOptions(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canCreate) return;
    if (!title.trim()) return;

    let finalOptions = [];
    if (optionMode === 'friends') {
      finalOptions = [...FRIENDS];
    } else if (optionMode === 'yesno') {
      finalOptions = ['Sí', 'No'];
    } else {
      finalOptions = customOptions.map(o => o.trim()).filter(Boolean);
      if (finalOptions.length < 2) return;
    }

    const success = onCreate({
      title: title.trim(),
      category,
      emoji,
      options: finalOptions
    });

    if (success) {
      setTitle('');
      setCustomOptions(['', '']);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-text">
            <h3>Nueva Votación</h3>
            <p>Publica una votación en vivo para todos los invitados</p>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Quota Banner */}
            {createdTodayCount === 0 && (
              <div className="quota-banner available">
                <span>✨ Tienes <strong>2 votaciones</strong> disponibles para crear hoy</span>
                <span>(0/2 creadas)</span>
              </div>
            )}
            {createdTodayCount === 1 && (
              <div className="quota-banner warning">
                <span>⚡ Te queda <strong>1 votación</strong> disponible para hoy</span>
                <span>(1/2 creadas)</span>
              </div>
            )}
            {createdTodayCount >= 2 && (
              <div className="quota-banner exhausted">
                <span>🚫 <strong>Límite alcanzado:</strong> Ya creaste 2 votaciones hoy. ¡Mañana podrás crear más!</span>
              </div>
            )}

            {/* Pregunta / Título */}
            <div className="form-field">
              <label>Pregunta o Título de la votación</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej: ¿Quién será el primero en pedir bajón?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canCreate}
                required
                maxLength={90}
              />
            </div>

            {/* Categoría & Emoji */}
            <div className="form-row">
              <div className="form-field">
                <label>Categoría</label>
                <select
                  className="form-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={!canCreate}
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Emoji</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '80px', textAlign: 'center', fontSize: '18px' }}
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  disabled={!canCreate}
                  maxLength={4}
                />
              </div>
            </div>

            {/* Quick Emojis */}
            <div className="form-field">
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>O elige rápido un emoji:</label>
              <div className="emoji-picker-row">
                {quickEmojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={`emoji-btn ${emoji === e ? 'selected' : ''}`}
                    onClick={() => setEmoji(e)}
                    disabled={!canCreate}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Modo de Opciones */}
            <div className="form-field">
              <label>Opciones a votar</label>
              <div className="mode-chips">
                <button
                  type="button"
                  className={`mode-chip ${optionMode === 'friends' ? 'active' : ''}`}
                  onClick={() => setOptionMode('friends')}
                  disabled={!canCreate}
                >
                  👥 Los 13 Amigos
                </button>
                <button
                  type="button"
                  className={`mode-chip ${optionMode === 'yesno' ? 'active' : ''}`}
                  onClick={() => setOptionMode('yesno')}
                  disabled={!canCreate}
                >
                  ⚖️ Sí / No
                </button>
                <button
                  type="button"
                  className={`mode-chip ${optionMode === 'custom' ? 'active' : ''}`}
                  onClick={() => setOptionMode('custom')}
                  disabled={!canCreate}
                >
                  ✏️ Libres
                </button>
              </div>
            </div>

            {/* Opciones details */}
            {optionMode === 'friends' && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-color)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
                Se incluirán automáticamente todos los amigos: <strong>{FRIENDS.slice(0, 6).join(', ')}</strong> y más ({FRIENDS.length} en total).
              </div>
            )}

            {optionMode === 'yesno' && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-color)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
                Votación binaria clásica: <strong>Sí</strong> o <strong>No</strong>.
              </div>
            )}

            {optionMode === 'custom' && (
              <div className="custom-options-container">
                {customOptions.map((opt, i) => (
                  <div key={i} className="custom-option-row">
                    <input
                      type="text"
                      className="form-input"
                      placeholder={`Opción ${i + 1}`}
                      value={opt}
                      onChange={(e) => handleCustomOptionChange(i, e.target.value)}
                      disabled={!canCreate}
                      required
                    />
                    {customOptions.length > 2 && (
                      <button
                        type="button"
                        className="btn-remove-opt"
                        onClick={() => handleRemoveCustomOption(i)}
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                ))}
                {customOptions.length < 8 && (
                  <button
                    type="button"
                    className="btn-add-opt"
                    onClick={handleAddCustomOption}
                    disabled={!canCreate}
                  >
                    <Plus size={15} /> Añadir otra opción
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-modal-submit"
              disabled={!canCreate || !title.trim()}
            >
              Publicar Votación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── App ────────────────────────────────────────────────── */
function App() {
  const [session, setSession] = useState(() => loadSession());
  const [votes, setVotes] = useState([]);
  const [selectedMarketId, setSelectedMarketId] = useState(null);
  const [currentPage, setCurrentPage] = useState('markets');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [toast, setToast] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    supabase.from('votes').select('*').order('created_at', { ascending: true }).then(({ data, error }) => {
      if (error) console.error("Error al cargar votos de Supabase:", error);
      if (data) setVotes(data);
    });

    const channel = supabase.channel('realtime-votes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, (payload) => {
        setVotes(prev => prev.some(v => v.id === payload.new.id) ? prev : [...prev, payload.new]);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const todayKey = getTodayKey();

  // Conteo de creaciones del usuario hoy (máximo 2 por día)
  const userCreationsToday = useMemo(() => {
    if (!session?.name) return 0;
    return votes.filter(
      v => v.vote_type === 'create_market' && 
           v.voter_name === session.name && 
           v.created_at && v.created_at.slice(0, 10) === todayKey
    ).length;
  }, [votes, session?.name, todayKey]);

  const marketEngineData = useMemo(() => {
    return computeMarketEngine(votes, session?.name);
  }, [votes, session?.name]);

  const markets = useMemo(() => {
    const baseMarkets = JSON.parse(JSON.stringify(INITIAL_MARKETS));

    // Agregar mercados creados por los usuarios desde Supabase
    const customMarketEvents = votes.filter(v => v.vote_type === 'create_market');
    customMarketEvents.forEach(evt => {
      try {
        const m = typeof evt.target_id === 'string' ? JSON.parse(evt.target_id) : evt.target_id;
        if (m && m.id && !baseMarkets.some(x => String(x.id) === String(m.id))) {
          if (!m.history || m.history.length === 0) {
            m.history = [
              {
                label: 'Inicio',
                data: Object.fromEntries(m.options.map(o => [o.name, Math.round(100 / (m.options.length || 1))]))
              }
            ];
          }
          baseMarkets.push(m);
        }
      } catch (e) {
        console.error("Error parsing custom market:", e);
      }
    });

    // Aplicar votos en tiempo real a todos los mercados
    votes.filter(v => v.vote_type === 'market').forEach(vote => {
      const m = baseMarkets.find(x => String(x.id) === String(vote.target_id));
      if (m) {
        const opt = m.options.find(o => o.name === vote.option_name);
        if (opt) {
          opt.shares += 10;
          const newCalculated = calculateOdds(m.options);
          const dateObj = new Date(vote.created_at);
          const newDataPoint = {
            label: isNaN(dateObj.getTime()) ? 'Ahora' : dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            data: {}
          };
          newCalculated.forEach(o => newDataPoint.data[o.name] = Math.round(o.prob * 100));
          m.history.push(newDataPoint);
          if (m.history.length > 20) m.history.shift();
        }
      }
    });

    // Marcar los mercados ya resueltos por el admin
    baseMarkets.forEach(m => {
      const resolution = marketEngineData.resolvedMarkets[String(m.id)];
      if (resolution) m.resolution = resolution;
    });

    return baseMarkets;
  }, [votes, marketEngineData.resolvedMarkets]);

  const selectedMarket = useMemo(() => {
    if (!selectedMarketId) return null;
    return markets.find(m => m.id === selectedMarketId) || null;
  }, [markets, selectedMarketId]);

  const { userPortfolio, stockLookup } = marketEngineData;
  const isAdmin = session?.name === ADMIN_NAME;

  const handleLogin = useCallback((name) => {
    const newSession = { name, day: getTodayKey(), spent: 0 };
    saveSession(newSession);
    setSession(newSession);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('capri-session-v2');
    setSession(null);
  }, []);

  const handleVote = useCallback((marketId, optionName) => {
    const market = markets.find(m => String(m.id) === String(marketId));
    if (market?.resolution) {
      setToast({ message: 'Esta votación ya fue resuelta.', type: 'error' });
      return;
    }

    if (userPortfolio.votesRemainingToday <= 0) {
      setToast({
        message: `¡Sin votos hoy! Tenés ${DAILY_VOTE_LIMIT} votos por día, mañana se renuevan.`,
        type: 'error'
      });
      return;
    }

    if (userPortfolio.cash < COST_PER_VOTE) {
      setToast({
        message: `¡Sin saldo suficiente! Te quedan $${userPortfolio.cash.toFixed(2)}. Vende acciones para conseguir efectivo.`,
        type: 'error'
      });
      return;
    }

    const newVote = {
      id: generateUUID(),
      vote_type: 'market',
      target_id: String(marketId),
      option_name: optionName,
      voter_name: session.name,
      created_at: new Date().toISOString()
    };

    setVotes(prev => [...prev, newVote]);
    supabase.from('votes').insert(newVote).then(({error}) => {
      if (error) console.error("Error insertando voto:", error);
    });
    setToast({ message: `Apostaste $${COST_PER_VOTE} por "${optionName}" (${userPortfolio.votesRemainingToday - 1} votos restantes hoy)`, type: 'success' });
  }, [session, userPortfolio.cash, userPortfolio.votesRemainingToday, markets]);

  const handleResolveMarket = useCallback((marketId, winningOption) => {
    if (session?.name !== ADMIN_NAME) return;
    const market = markets.find(m => String(m.id) === String(marketId));
    if (market?.resolution) {
      setToast({ message: 'Esta votación ya fue resuelta.', type: 'error' });
      return;
    }

    const newEvent = {
      id: generateUUID(),
      vote_type: 'resolve_market',
      target_id: String(marketId),
      option_name: winningOption,
      voter_name: session.name,
      created_at: new Date().toISOString()
    };

    setVotes(prev => [...prev, newEvent]);
    supabase.from('votes').insert(newEvent).then(({ error }) => {
      if (error) console.error("Error resolviendo votación:", error);
    });
    setToast({ message: `🏆 Votación resuelta: ganó "${winningOption}". Pagos acreditados.`, type: 'success' });
  }, [session, markets]);

  const handleTrade = useCallback(({ stockId, action, amount, shares, price }) => {
    if (!session?.name) return;
    const stock = stockLookup[stockId];
    const stockTicker = stock?.ticker || 'ACT';

    const newTradeEvent = {
      id: generateUUID(),
      vote_type: 'trade',
      target_id: String(stockId),
      option_name: JSON.stringify({
        action,
        amount,
        shares,
        price
      }),
      voter_name: session.name,
      created_at: new Date().toISOString()
    };

    setVotes(prev => [...prev, newTradeEvent]);
    supabase.from('votes').insert(newTradeEvent).then(({ error }) => {
      if (error) console.error("Error trade supabase:", error);
    });

    if (action === 'BUY') {
      setToast({ 
        message: `🚀 Compraste ${shares} acc de ${stockTicker} por $${amount.toFixed(2)}`, 
        type: 'success' 
      });
    } else {
      setToast({ 
        message: `💰 Vendiste ${shares} acc de ${stockTicker} (+ $${amount.toFixed(2)})`, 
        type: 'success' 
      });
    }
  }, [session, stockLookup]);

  const handleStockDirectVote = useCallback((stockId) => {
    if (!session?.name) return;
    const stock = stockLookup[stockId];
    const newVote = {
      id: generateUUID(),
      vote_type: 'stock',
      target_id: String(stockId),
      option_name: null,
      voter_name: session.name,
      created_at: new Date().toISOString()
    };
    setVotes(prev => [...prev, newVote]);
    supabase.from('votes').insert(newVote).then(({ error }) => {
      if (error) console.error("Error voting stock:", error);
    });
    setToast({ message: `🔥 Voto enviado a ${stock?.ticker || 'Acción'} — precio subiendo!`, type: 'success' });
  }, [session, stockLookup]);

  const handleCreateMarket = useCallback(({ title, category, emoji, options }) => {
    if (userCreationsToday >= 2) {
      setToast({ message: '⚠️ Límite alcanzado: máximo 2 votaciones por día.', type: 'error' });
      return false;
    }

    const marketId = generateUUID();
    const optionsArray = options.map(opt => ({
      name: opt.trim(),
      shares: 20
    }));

    const initialProb = Math.round(100 / (optionsArray.length || 1));
    const newMarket = {
      id: marketId,
      title: title.trim(),
      category: category || 'Fiesta',
      emoji: emoji || '🎯',
      volume: '$0 Vol.',
      endDate: '17 de Octubre',
      author: session.name,
      isCustom: true,
      options: optionsArray,
      history: [
        {
          label: 'Inicio',
          data: Object.fromEntries(optionsArray.map(o => [o.name, initialProb]))
        }
      ]
    };

    const newEvent = {
      id: marketId,
      vote_type: 'create_market',
      target_id: JSON.stringify(newMarket),
      option_name: newMarket.title,
      voter_name: session.name,
      created_at: new Date().toISOString()
    };

    setVotes(prev => [...prev, newEvent]);
    supabase.from('votes').insert(newEvent).then(({ error }) => {
      if (error) {
        console.error("Error al publicar votación en Supabase:", error);
        setToast({ message: 'Error al publicar votación en la nube', type: 'error' });
      } else {
        setToast({ message: '🎉 ¡Votación creada y publicada para todos!', type: 'success' });
      }
    });

    return true;
  }, [userCreationsToday, session]);

  const handleNavigate = (page) => {
    setCurrentPage(page);
    setSelectedMarketId(null);
  };

  const filteredMarkets = useMemo(() => {
    if (!activeCategory || activeCategory === 'Todos') return markets;
    return markets.filter(m => m.category === activeCategory);
  }, [markets, activeCategory]);

  // Show login if no session
  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const sessionValue = { session, logout: handleLogout };

  return (
    <SessionCtx.Provider value={sessionValue}>
      <div className="app">
        <Header 
          currentPage={currentPage} 
          onNavigate={handleNavigate}
          onOpenCreate={() => setIsCreateModalOpen(true)}
          createdTodayCount={userCreationsToday}
          userPortfolio={userPortfolio}
        />
        <NavCategories 
          currentPage={currentPage} 
          onNavigate={handleNavigate} 
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
        />

        {currentPage === 'acciones' ? (
          <AccionesPage 
            marketEngineData={marketEngineData}
            onTrade={handleTrade}
            onStockVote={handleStockDirectVote}
          />
        ) : (
          <main className="main-layout">
            <Sidebar 
              markets={markets}
              activeCategory={activeCategory}
              onSelectCategory={setActiveCategory}
            />
            <div className="content">
              {selectedMarket ? (
                <MarketDetail
                  market={selectedMarket}
                  onBack={() => setSelectedMarketId(null)}
                  onVote={handleVote}
                  isAdmin={isAdmin}
                  onResolve={handleResolveMarket}
                />
              ) : (
                <>
                  {activeCategory === 'Todos' && markets[0] && (
                    <HeroMarket 
                      market={markets[0]} 
                      onVote={handleVote} 
                      onClick={(m) => setSelectedMarketId(m.id)} 
                    />
                  )}
                  <div className="markets-section-header">
                    <h2 className="section-title" style={{margin: 0}}>
                      {activeCategory === 'Todos' ? 'Todos los mercados' : `Mercados de ${activeCategory}`}
                    </h2>
                    <button 
                      className="btn-secondary-create"
                      onClick={() => setIsCreateModalOpen(true)}
                    >
                      <Plus size={16} /> Crear Votación ({Math.max(0, 2 - userCreationsToday)} disp.)
                    </button>
                  </div>
                  <div className="markets-grid">
                    {(activeCategory === 'Todos' ? filteredMarkets.slice(1) : filteredMarkets).map(market => (
                      <MarketCard
                        key={market.id}
                        market={market}
                        onVote={handleVote}
                        onClick={(m) => setSelectedMarketId(m.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </main>
        )}

        <CreateMarketModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateMarket}
          createdTodayCount={userCreationsToday}
        />

        {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      </div>
    </SessionCtx.Provider>
  );
}

export default App;
