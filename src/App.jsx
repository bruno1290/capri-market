import React, { useState, useMemo, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { Search, TrendingUp, Clock, BarChart2, MessageCircle, Gift, Bookmark, ArrowLeft, Star, ChevronUp, ChevronDown, Zap, Users, Heart, DollarSign, LogOut, User } from 'lucide-react';
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
   - $10 daily balance, resets each calendar day
   - Each vote costs $1
   - Persisted in localStorage
   ═══════════════════════════════════════════════════════════ */

const DAILY_BUDGET = 10;
const COST_PER_VOTE = 1;

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
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
        <p className="login-subtitle">Selecciona tu nombre para entrar</p>
        <p className="login-budget-info">
          <DollarSign size={16} /> Recibes <strong>${DAILY_BUDGET}</strong> diarios para apostar
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
function Header({ currentPage, onNavigate }) {
  const { session, logout } = useSession();
  const remaining = DAILY_BUDGET - session.spent;

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
        <div className="header-balance">
          <DollarSign size={16} />
          <span className={`balance-amount ${remaining <= 2 ? 'low' : ''}`}>
            ${remaining.toFixed(0)}
          </span>
          <span className="balance-label">restantes hoy</span>
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
function NavCategories({ currentPage, onNavigate }) {
  const items = [
    { key: 'markets', label: '🔥 Tendencia', icon: null },
    { key: 'acciones', label: '📈 Acciones', icon: null },
    { key: 'markets', label: 'Fiesta', icon: null },
    { key: 'markets', label: 'Salseo', icon: null },
    { key: 'markets', label: 'Random', icon: null },
    { key: 'markets', label: 'Deportes', icon: null },
  ];

  return (
    <div className="nav-categories">
      {items.map((item, i) => (
        <div
          key={i}
          className={`nav-item ${(i === 0 && currentPage === 'markets') || (i === 1 && currentPage === 'acciones') ? 'active' : ''}`}
          onClick={() => onNavigate(item.key)}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

/* ── Sidebar (Markets page) ─────────────────────────────── */
function Sidebar() {
  const items = [
    { name: "Todos los mercados", count: 24 },
    { name: "Fiesta", count: 8 },
    { name: "Salseo", count: 5 },
    { name: "Puntualidad", count: 3 },
    { name: "Deportes", count: 2 },
    { name: "Random", count: 6 },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-menu">
        {items.map((item, i) => (
          <div key={i} className={`sidebar-item ${i === 0 ? 'active' : ''}`}>
            <span>{item.name}</span>
            <span className="sidebar-badge">{item.count}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ── Acciones Sidebar ───────────────────────────────────── */
function AccionesSidebar({ activeTab, onTabChange }) {
  const items = [
    { key: 'discover', name: 'Descubrir', icon: <Zap size={16} /> },
    { key: 'ranking', name: 'Clasificación', icon: <Star size={16} /> },
  ];
  const assets = [
    { key: 'all', name: 'Todos los acti...', count: BROS.length + HOES.length },
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

/* ── Featured Stock Card (Destacados) ───────────────────── */
function FeaturedCard({ stock, onVote }) {
  const isUp = stock.change >= 0;
  return (
    <div className={`featured-card ${isUp ? 'featured-up' : 'featured-down'}`}>
      <div className="featured-top">
        <div className="featured-badge">
          <span className="featured-emoji">{stock.emoji}</span>
          <span className="featured-ticker">{stock.ticker}</span>
        </div>
        <Star size={18} className="featured-star" />
      </div>
      <div className="featured-name">{stock.name}</div>
      <div className="featured-chart">
        <Sparkline data={stock.sparkline} color={isUp ? '#00ba7c' : '#f91880'} width={120} height={48} />
      </div>
      <div className="featured-bottom">
        <span className="featured-price">${stock.price.toLocaleString()}</span>
        <span className={`featured-change ${isUp ? 'up' : 'down'}`}>
          {isUp ? '+' : ''}{stock.change}%
        </span>
        <span className="featured-leverage">{stock.leverage}x</span>
      </div>
      <button className="btn-vote-stock" onClick={() => onVote(stock.id)}>
        <ChevronUp size={14} /> Votar · $1
      </button>
    </div>
  );
}

/* ── Stock Row (Más subidas / bajadas) ──────────────────── */
function StockRow({ stock, rank, onVote }) {
  const isUp = stock.change >= 0;
  return (
    <div className="stock-row">
      {rank && <span className="stock-rank">{rank}</span>}
      <span className="stock-row-emoji">{stock.emoji}</span>
      <div className="stock-row-info">
        <span className="stock-row-ticker">{stock.ticker}</span>
        <span className="stock-row-name">{stock.name}</span>
      </div>
      <div className="stock-row-spark">
        <Sparkline data={stock.sparkline} color={isUp ? '#00ba7c' : '#f91880'} width={60} height={28} />
      </div>
      <div className="stock-row-right">
        <span className="stock-row-price">${stock.price.toLocaleString()}</span>
        <span className={`stock-row-change ${isUp ? 'up' : 'down'}`}>
          {isUp ? '+' : ''}${Math.abs(stock.change).toFixed(2)} ({Math.abs(stock.change).toFixed(2)}%)
        </span>
      </div>
      <button className="btn-vote-mini" onClick={() => onVote(stock.id)}>
        <ChevronUp size={14} />
      </button>
    </div>
  );
}

/* ── Acciones Page ──────────────────────────────────────── */
function AccionesPage() {
  const { session, spend } = useSession();
  const [activeTab, setActiveTab] = useState('discover');
  const [bros, setBros] = useState(() => loadStocks('capri-bros', BROS));
  const [hoes, setHoes] = useState(() => loadStocks('capri-hoes', HOES));

  // Persist stocks
  useEffect(() => { saveStocks('capri-bros', bros); }, [bros]);
  useEffect(() => { saveStocks('capri-hoes', hoes); }, [hoes]);

  const handleVote = (id) => {
    if (!spend(COST_PER_VOTE)) return; // no budget
    const updateList = (list) =>
      list.map(s => {
        if (s.id !== id) return s;
        const bump = +(s.price * 0.012).toFixed(2);
        const newPrice = +(s.price + bump).toFixed(2);
        const newChange = +(s.change + 1.2).toFixed(2);
        return { ...s, price: newPrice, change: newChange, votes: s.votes + 1, sparkline: [...s.sparkline.slice(1), newPrice] };
      });
    setBros(updateList);
    setHoes(updateList);
  };

  const allStocks = useMemo(() => [...bros, ...hoes], [bros, hoes]);
  const topGainers = useMemo(() => [...allStocks].sort((a, b) => b.change - a.change).slice(0, 5), [allStocks]);
  const topLosers = useMemo(() => [...allStocks].sort((a, b) => a.change - b.change).slice(0, 5), [allStocks]);
  const featured = useMemo(() => [...allStocks].sort((a, b) => b.votes - a.votes).slice(0, 4), [allStocks]);

  const displayList = activeTab === 'bros' ? bros
    : activeTab === 'hoes' ? hoes
    : activeTab === 'ranking' ? [...allStocks].sort((a, b) => b.votes - a.votes)
    : null;

  const remaining = DAILY_BUDGET - session.spent;

  return (
    <main className="main-layout">
      <AccionesSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="content">
        <div className="acciones-header-row">
          <div>
            <h2 className="section-title" style={{ marginBottom: 4 }}>Acciones</h2>
            <p className="acciones-subtitle">Opera Bros y Hoes 24/7 con hasta 50x de apalancamiento.</p>
          </div>
          <div className="search-bar" style={{ width: 240 }}>
            <Search size={16} />
            <input type="text" placeholder="Buscar" />
          </div>
        </div>

        {/* Discover tab */}
        {activeTab === 'discover' && (
          <>
            {/* Destacados */}
            <h3 className="subsection-title">Destacados ⭐</h3>
            <div className="featured-grid">
              {featured.map(s => <FeaturedCard key={s.id} stock={s} onVote={handleVote} />)}
            </div>

            {/* Más subidas / bajadas */}
            <div className="gainers-losers">
              <div className="gl-col">
                <div className="gl-header">
                  <h3 className="subsection-title">Más subidas</h3>
                  <span className="gl-view-all">Ver todo</span>
                </div>
                {topGainers.map((s, i) => <StockRow key={s.id} stock={s} rank={i + 1} onVote={handleVote} />)}
              </div>
              <div className="gl-col">
                <div className="gl-header">
                  <h3 className="subsection-title">Más bajadas</h3>
                  <span className="gl-view-all">Ver todo</span>
                </div>
                {topLosers.map((s, i) => <StockRow key={s.id} stock={s} rank={i + 1} onVote={handleVote} />)}
              </div>
            </div>
          </>
        )}

        {/* Ranking tab */}
        {activeTab === 'ranking' && (
          <>
            <h3 className="subsection-title">Ranking por votos 🏆</h3>
            <div className="ranking-table">
              <div className="ranking-header-row">
                <span>#</span>
                <span>Activo</span>
                <span>Precio</span>
                <span>Cambio</span>
                <span>Votos</span>
                <span></span>
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
                  <span className="ranking-price">${s.price.toLocaleString()}</span>
                  <span className={`stock-row-change ${s.change >= 0 ? 'up' : 'down'}`}>
                    {s.change >= 0 ? '+' : ''}{s.change}%
                  </span>
                  <span className="ranking-votes">{s.votes}</span>
                  <button className="btn-vote-mini" onClick={() => handleVote(s.id)}>
                    <ChevronUp size={14} /> Votar
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Bros / Hoes / All tabs */}
        {(activeTab === 'bros' || activeTab === 'hoes' || activeTab === 'all') && (
          <>
            <h3 className="subsection-title">
              {activeTab === 'bros' ? '🧑‍🤝‍🧑 Bros' : activeTab === 'hoes' ? '💅 Hoes' : '📋 Todos los activos'}
            </h3>
            <div className="stock-list-full">
              {(activeTab === 'all' ? allStocks : displayList).map((s, i) => (
                <div className="stock-full-row" key={s.id}>
                  <span className="stock-rank">{i + 1}</span>
                  <span className="stock-row-emoji">{s.emoji}</span>
                  <div className="stock-row-info">
                    <span className="stock-row-ticker">{s.ticker}</span>
                    <span className="stock-row-name">{s.name}</span>
                  </div>
                  <div className="stock-row-spark">
                    <Sparkline data={s.sparkline} color={s.change >= 0 ? '#00ba7c' : '#f91880'} width={80} height={32} />
                  </div>
                  <div className="stock-row-right">
                    <span className="stock-row-price">${s.price.toLocaleString()}</span>
                    <span className={`stock-row-change ${s.change >= 0 ? 'up' : 'down'}`}>
                      {s.change >= 0 ? '+' : ''}{s.change}%
                    </span>
                  </div>
                  <span className="stock-full-votes">{s.votes} votos</span>
                  <span className="stock-full-leverage">{s.leverage}x</span>
                  <button className="btn-vote-mini" onClick={() => handleVote(s.id)}>
                    <ChevronUp size={14} /> Votar
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/* ── Market Card ────────────────────────────────────────── */
function MarketCard({ market, onVote, onClick }) {
  const calculatedOptions = calculateOdds(market.options).slice(0, 2);

  return (
    <div className="market-card" onClick={() => onClick(market)}>
      <div className="card-header">
        <div className="card-icon">{market.emoji || '🎭'}</div>
        <div className="card-title">{market.title}</div>
      </div>
      <div className="card-options">
        {calculatedOptions.map((opt, i) => (
          <div className="option-row" key={i}>
            <div className="option-name">{opt.name}</div>
            <div className="option-actions">
              <span className="option-prob">{opt.percentage}</span>
              <button
                className={`btn-vote ${market.options.length === 2 ? (i === 0 ? 'yes' : 'no') : 'buy'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onVote(market.id, opt.name);
                }}
              >
                {market.options.length === 2 ? (i === 0 ? 'Sí' : 'No') : '$1'}
              </button>
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
                ● {opt.name}
              </div>
              <button
                className={`btn-vote ${isBinary ? (i === 0 ? 'yes' : 'no') : 'buy'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onVote(market.id, opt.name);
                }}
              >
                {isBinary ? (i === 0 ? 'Sí' : 'No') : 'Comprar'} · $1
              </button>
            </div>
          ))}
          
          <div className="hero-market-footer">
            <span className="flex-center"><img src="https://ui-avatars.com/api/?name=Capri&background=random&rounded=true" width="20" height="20" alt="avatar"/> Capri Admin</span>
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
function MarketDetail({ market, onVote, onBack }) {
  const calculatedOptions = calculateOdds(market.options);
  const colors = ['#1d9bf0', '#00ba7c', '#f91880', '#fbbf24', '#8b5cf6'];

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
          <div className="flex-center" style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '14px' }}>
            {market.category} • Finaliza {market.endDate}
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

      <h3 style={{ marginBottom: '16px', fontSize: '20px' }}>Opciones</h3>
      <div className="detail-options-grid">
        {calculatedOptions.map((opt, i) => (
          <div className="detail-option-card" key={i}>
            <div className="detail-option-header">
              <div className="avatar" style={{background: colors[i % colors.length]}}>{opt.name.charAt(0)}</div>
              <div className="detail-option-name">{opt.name}</div>
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
            <button
              className="btn-buy-large"
              style={{background: colors[i % colors.length]}}
              onClick={() => onVote(market.id, opt.name)}
            >
              Comprar {opt.name} · $1
            </button>
          </div>
        ))}
      </div>
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

/* ── App ────────────────────────────────────────────────── */
function App() {
  const [session, setSession] = useState(() => loadSession());
  const [markets, setMarkets] = useState(() => loadMarkets());
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [currentPage, setCurrentPage] = useState('markets');
  const [toast, setToast] = useState(null);

  // Persist markets
  useEffect(() => { saveMarkets(markets); }, [markets]);

  const handleLogin = useCallback((name) => {
    const newSession = { name, day: getTodayKey(), spent: 0 };
    saveSession(newSession);
    setSession(newSession);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('capri-session-v2');
    setSession(null);
  }, []);

  const spend = useCallback((amount) => {
    const s = { ...session };
    // Reset if new day
    if (s.day !== getTodayKey()) {
      s.day = getTodayKey();
      s.spent = 0;
    }
    const remaining = DAILY_BUDGET - s.spent;
    if (remaining < amount) {
      setToast({ message: `Sin saldo! Te quedan $${remaining} hoy`, type: 'error' });
      return false;
    }
    s.spent += amount;
    saveSession(s);
    setSession(s);
    setToast({ message: `Gastaste $${amount} — te quedan $${DAILY_BUDGET - s.spent}`, type: 'success' });
    return true;
  }, [session]);

  const handleVote = useCallback((marketId, optionName) => {
    if (!spend(COST_PER_VOTE)) return;
    
    setMarkets(prev => prev.map(m => {
      if (m.id === marketId) {
        // Update the shares for the voted option
        const newOptions = m.options.map(opt =>
          opt.name === optionName ? { ...opt, shares: opt.shares + 10 } : opt
        );
        
        // Calculate the NEW probabilities so we can add them to the chart history
        const newCalculated = calculateOdds(newOptions);
        const newDataPoint = { label: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), data: {} };
        newCalculated.forEach(opt => {
          newDataPoint.data[opt.name] = Math.round(opt.prob * 100);
        });
        
        // Append this new point to history (keeping max 20 points so it doesn't get infinitely long)
        const newHistory = [...m.history, newDataPoint].slice(-20);

        return { ...m, options: newOptions, history: newHistory };
      }
      return m;
    }));

    if (selectedMarket && selectedMarket.id === marketId) {
      setSelectedMarket(prev => {
        const newOptions = prev.options.map(opt =>
          opt.name === optionName ? { ...opt, shares: opt.shares + 10 } : opt
        );
        const newCalculated = calculateOdds(newOptions);
        const newDataPoint = { label: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), data: {} };
        newCalculated.forEach(opt => {
          newDataPoint.data[opt.name] = Math.round(opt.prob * 100);
        });
        const newHistory = [...prev.history, newDataPoint].slice(-20);
        
        return { ...prev, options: newOptions, history: newHistory };
      });
    }
  }, [spend, selectedMarket]);

  const handleNavigate = (page) => {
    setCurrentPage(page);
    setSelectedMarket(null);
  };

  // Show login if no session
  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const sessionValue = { session, logout: handleLogout, spend };

  return (
    <SessionCtx.Provider value={sessionValue}>
      <div className="app">
        <Header currentPage={currentPage} onNavigate={handleNavigate} />
        <NavCategories currentPage={currentPage} onNavigate={handleNavigate} />

        {currentPage === 'acciones' ? (
          <AccionesPage />
        ) : (
          <main className="main-layout">
            <Sidebar />
            <div className="content">
              {selectedMarket ? (
                <MarketDetail
                  market={selectedMarket}
                  onBack={() => setSelectedMarket(null)}
                  onVote={handleVote}
                />
              ) : (
                <>
                  <HeroMarket 
                    market={markets[0]} 
                    onVote={handleVote} 
                    onClick={setSelectedMarket} 
                  />
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 16}}>
                    <h2 className="section-title" style={{margin: 0}}>Todos los mercados</h2>
                  </div>
                  <div className="markets-grid">
                    {markets.slice(1).map(market => (
                      <MarketCard
                        key={market.id}
                        market={market}
                        onVote={handleVote}
                        onClick={setSelectedMarket}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </main>
        )}

        {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      </div>
    </SessionCtx.Provider>
  );
}

export default App;
