import React, { useState, useMemo, useEffect, useCallback, createContext, useContext } from 'react';
import { Search, TrendingUp, Clock, BarChart2, MessageCircle, Gift, X, Star, Zap, Users, LogOut, ChevronUp } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { INITIAL_MARKETS, FRIENDS, BROS, HOES } from './data';
import { computeMarketEngine, STARTING_CASH, DAILY_ALLOWANCE, ADMIN_NAME, STOCK_HYPE_LIMIT } from './marketEngine';
import { supabase } from './supabase';
import './index.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ── UTILIDADES ──────────────────────────────────────────
function getTodayKey() { return new Date().toISOString().slice(0, 10); }

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);
  });
}

function loadSession() {
  try {
    const raw = localStorage.getItem('capri-session-v2');
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session.day !== getTodayKey()) {
      session.day = getTodayKey();
      session.spent = 0;
      localStorage.setItem('capri-session-v2', JSON.stringify(session));
    }
    return session;
  } catch { return null; }
}

// Calcula las probabilidades (precios) estilo Polymarket
const getPolymarketOdds = (options) => {
  const totalLiq = options.reduce((sum, opt) => sum + (opt.liquidity || opt.shares || 20), 0);
  return options.map(opt => {
    const liq = opt.liquidity || opt.shares || 20;
    const price = totalLiq === 0 ? 0 : liq / totalLiq;
    return {
      ...opt,
      price,
      percentage: Math.round(price * 100) + "%",
      payout: price === 0 ? 0 : (1 / price).toFixed(2)
    };
  }).sort((a, b) => b.price - a.price);
};

const SessionCtx = createContext(null);
function useSession() { return useContext(SessionCtx); }

// ── COMPONENTES BASE ────────────────────────────────────

function LoginScreen({ onLogin }) {
  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-logo">
          <h1>🤑 Capri Market</h1>
        </div>
        <p className="login-subtitle">La bolsa de valores oficial de la fiesta.</p>
        <div className="login-budget-info">
          <span>Mesada diaria: </span><strong>${DAILY_ALLOWANCE} USD</strong>
        </div>
        <div className="login-grid">
          {FRIENDS.map(name => (
            <button key={name} className="login-friend-btn" onClick={() => onLogin(name)}>
              <div className="login-avatar">{name.charAt(0)}</div>
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Header({ userPortfolio, onLogout }) {
  const { session } = useSession();
  const cash = userPortfolio?.cash || 0;

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">🤑 Capri Market</div>
        <div className="search-bar">
          <Search size={18} />
          <input type="text" placeholder="Buscar mercados, Bros o Hoes..." />
        </div>
      </div>
      <div className="header-right">
        <div className="header-balance">
          <span className="balance-label">Caja:</span>
          <span className="balance-amount">${cash.toFixed(2)}</span>
        </div>
        <div className="header-user">
          <div className="header-avatar">{session?.name?.charAt(0) || 'U'}</div>
          <span className="header-username">{session?.name}</span>
        </div>
        <button className="btn-logout" onClick={onLogout} title="Salir">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

function NavCategories({ active, onSelect }) {
  const cats = ['Todos', 'Tendencias', 'Polémicos', 'Deportes', 'Cahuines'];
  return (
    <div className="nav-categories">
      {cats.map(c => (
        <div key={c} className={`nav-item ${active === c ? 'active' : ''}`} onClick={() => onSelect(c)}>
          {c}
        </div>
      ))}
    </div>
  );
}

function Sidebar({ current, onChange }) {
  const menu = [
    { id: 'markets', icon: <TrendingUp size={18} />, label: 'Predicciones' },
    { id: 'portfolio', icon: <Briefcase size={18} />, label: 'Mi Cartera' },
    { id: 'leaderboard', icon: <Award size={18} />, label: 'Ranking' }
  ];
  return (
    <div className="sidebar">
      <div className="sidebar-menu">
        {menu.map(item => (
          <div key={item.id} className={`sidebar-item ${current === item.id ? 'active' : ''}`} onClick={() => onChange(item.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {item.icon}
              <span>{item.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toast({ message, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className={`toast toast-${type}`}>{message}</div>;
}

// ── BANNER DE REGLAS ────────────────────────────────────
function RulesBanner() {
  const [isVisible, setIsVisible] = useState(() => {
    return localStorage.getItem('capri-rules-closed') !== 'true';
  });

  if (!isVisible) return null;

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem('capri-rules-closed', 'true');
  };

  return (
    <div className="rules-banner">
      <button className="btn-close-banner" onClick={handleClose}>
        <X size={16} />
      </button>

      <h3>📖 ¿Cómo funciona Capri Market?</h3>
      <p style={{ fontSize: '14px', color: '#94a3b8' }}>Lee esto rápido antes de perder toda tu plata.</p>

      <div className="rules-grid">
        <div className="rule-box">
          <h4>💰 El Dinero (USD Capri)</h4>
          <p>Empiezas con <strong>$10</strong>. Cada día que entres recibes $10 extra de mesada.</p>
          <p>Multiplica tu plata especulando. ¡El que llega a cero quiebra!</p>
        </div>

        <div className="rule-box">
          <h4>📈 Bolsa (Bros & Hoes)</h4>
          <ul>
            <li>Compra barato, vende caro. El precio sube por oferta y demanda.</li>
            <li>Tienes <strong>20 clicks diarios</strong> para inflar gratis una acción (Hype Clicks).</li>
          </ul>
        </div>

        <div className="rule-box">
          <h4>🔮 Predicciones Polymarket</h4>
          <ul>
            <li>Compra "contratos" de encuestas. Los precios fluctúan entre $0.01 y $0.99.</li>
            <li>Puedes vender tus contratos en vivo si el precio sube.</li>
            <li>Gacela (Admin) resuelve. ¡La opción ganadora te paga <strong>$1.00</strong> por cada contrato que tengas!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── MODAL DE TRADING DE PREDICCIONES (POLYMARKET) ────────
function TradeMarketModal({ market, optionData, userPortfolio, isOpen, onClose, onTrade }) {
  const [action, setAction] = useState('BUY');
  const [amountStr, setAmountStr] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) { setAction('BUY'); setAmountStr('1'); }
  }, [isOpen, market]);

  if (!isOpen || !market || !optionData) return null;

  const currentPrice = optionData.price || 0.01;
  const mPosKey = `${market.id}_${optionData.name}`;
  const marketPositionsList = Array.isArray(userPortfolio?.marketPositionsList) ? userPortfolio.marketPositionsList : [];
  const holding = marketPositionsList.find(p => p.marketId === String(market.id) && p.optionName === optionData.name);

  const ownedShares = holding ? holding.shares : 0;
  const ownedValue = +(ownedShares * currentPrice).toFixed(2);
  const availableCash = userPortfolio?.cash || 0;

  const numAmount = parseFloat(amountStr) || 0;
  const estimatedShares = action === 'BUY'
    ? (currentPrice > 0 ? +(numAmount / currentPrice).toFixed(4) : 0)
    : (currentPrice > 0 ? Math.min(ownedShares, +(numAmount / currentPrice).toFixed(4)) : 0);

  const isBuyValid = action === 'BUY' && numAmount > 0 && numAmount <= (availableCash + 0.001);
  const isSellValid = action === 'SELL' && numAmount > 0 && numAmount <= (ownedValue + 0.05);
  const isValid = action === 'BUY' ? isBuyValid : isSellValid;

  const handleConfirm = () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    const finalAmount = Math.min(numAmount, action === 'BUY' ? availableCash : ownedValue);
    const finalShares = action === 'BUY' ? +(finalAmount / currentPrice).toFixed(4) : estimatedShares;

    onTrade({
      marketId: market.id,
      optionName: optionData.name,
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
            <div className="trade-header-emoji">{market.emoji}</div>
            <div>
              <div className="trade-header-title">{optionData.name}</div>
              <div className="trade-header-sub">{market.title}</div>
            </div>
          </div>
          <button className="btn-close-modal" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="trade-tabs">
          <button className={`trade-tab-btn buy ${action === 'BUY' ? 'active' : ''}`} onClick={() => { setAction('BUY'); setAmountStr('1'); }}>Comprar 🟢</button>
          <button className={`trade-tab-btn sell ${action === 'SELL' ? 'active' : ''}`} onClick={() => { setAction('SELL'); setAmountStr(ownedValue > 0 ? String(ownedValue) : '0'); }}>Vender 🔴 {ownedShares > 0 ? `(${ownedShares.toFixed(1)} ctros)` : ''}</button>
        </div>

        <div className="trade-modal-body">
          <div className="trade-price-strip">
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Precio del Contrato</div>
              <div className="trade-current-price">${currentPrice.toFixed(2)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="featured-change up" style={{ fontSize: 14 }}>{optionData.percentage} Prob.</span>
            </div>
          </div>

          <div className="trade-input-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
              <span>Monto (USD Capri)</span>
              <span style={{ color: 'var(--text-secondary)' }}>{action === 'BUY' ? `Disponible: $${availableCash.toFixed(2)}` : `En cartera: $${ownedValue.toFixed(2)}`}</span>
            </div>
            <div className="trade-input-row">
              <span className="trade-input-prefix">$</span>
              <input type="number" step="any" min="0" className="trade-amount-input" value={amountStr} onChange={e => setAmountStr(e.target.value)} autoFocus />
            </div>
          </div>

          <div className="trade-details-panel">
            <div className="trade-detail-row"><span>Contratos a {action === 'BUY' ? 'recibir' : 'entregar'}:</span><span>{estimatedShares.toFixed(2)}</span></div>
            <div className="trade-detail-row"><span>Si gana la opción, paga:</span><span style={{ color: 'var(--accent-green)' }}>${(action === 'BUY' ? estimatedShares * 1 : ownedShares * 1).toFixed(2)}</span></div>
          </div>

          <button className={`btn-confirm-trade ${action === 'BUY' ? 'buy' : 'sell'}`} disabled={!isValid || submitting} onClick={handleConfirm}>
            {action === 'BUY' ? `Comprar $${numAmount.toFixed(2)}` : `Vender $${numAmount.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP COMPONENT ──────────────────────────────────
function App() {
  const [session, setSession] = useState(() => loadSession());
  const [votes, setVotes] = useState([]);
  const [selectedMarketId, setSelectedMarketId] = useState(null);
  const [currentPage, setCurrentPage] = useState('markets');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [toast, setToast] = useState(null);
  const [tradeMarketData, setTradeMarketData] = useState(null);

  useEffect(() => {
    supabase.from('votes').select('*').order('created_at', { ascending: true }).then(({ data }) => {
      if (data) setVotes(data);
    });
    const channel = supabase.channel('realtime-votes').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, (payload) => {
      setVotes(prev => prev.some(v => v.id === payload.new.id) ? prev : [...prev, payload.new]);
    }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const marketEngineData = useMemo(() => computeMarketEngine(votes, session?.name), [votes, session?.name]);
  const userPortfolio = marketEngineData.userPortfolio;

  const markets = useMemo(() => {
    const baseMarkets = JSON.parse(JSON.stringify(INITIAL_MARKETS));
    Object.values(marketEngineData.customMarkets).forEach(m => {
      if (!baseMarkets.some(x => String(x.id) === String(m.id))) baseMarkets.push(m);
    });

    return baseMarkets.map(m => {
      const engMarket = marketEngineData.customMarkets[m.id];
      const currentOptions = engMarket ? engMarket.options : m.options;
      m.options = getPolymarketOdds(currentOptions);
      m.resolution = marketEngineData.resolvedMarkets[String(m.id)];
      return m;
    });
  }, [marketEngineData]);

  const handleMarketTrade = useCallback(({ marketId, optionName, action, amount, shares, price }) => {
    const tradeEvent = {
      id: generateUUID(),
      vote_type: 'trade_market',
      target_id: String(marketId),
      option_name: JSON.stringify({ action, amount, shares, price, optionName }),
      voter_name: session.name,
      created_at: new Date().toISOString()
    };
    setVotes(prev => [...prev, tradeEvent]);
    supabase.from('votes').insert(tradeEvent);
    setToast({ message: `${action === 'BUY' ? 'Compraste' : 'Vendiste'} contratos de "${optionName}"`, type: 'success' });
  }, [session]);

  const handleOpenMarketTrade = (market, optionData) => {
    if (market.resolution) {
      setToast({ message: 'Votación cerrada. Gacela ya resolvió este mercado.', type: 'error' });
      return;
    }
    setTradeMarketData({ market, optionData });
  };

  const handleLogout = () => {
    localStorage.removeItem('capri-session-v2');
    setSession(null);
  };

  if (!session) return <LoginScreen onLogin={(name) => {
    const newSession = { name, day: getTodayKey(), spent: 0 };
    setSession(newSession);
    saveSession(newSession);
  }} />;

  return (
    <SessionCtx.Provider value={{ session }}>
      <div className="app">

        <Header userPortfolio={userPortfolio} onLogout={handleLogout} />
        <NavCategories active={activeCategory} onSelect={setActiveCategory} />

        {currentPage === 'markets' && (
          <main className="main-layout">
            <Sidebar current={currentPage} onChange={setCurrentPage} />
            <div className="content">

              {/* BANNER DE REGLAS */}
              <RulesBanner />

              <div className="markets-section-header">
                <h2 className="section-title">Mercados de Predicción 🔮</h2>
              </div>

              <div className="markets-grid">
                {markets.map(market => (
                  <div className="market-card" key={market.id} onClick={() => setSelectedMarketId(market.id)}>
                    <div className="card-header">
                      <div className="card-icon">{market.emoji}</div>
                      <div className="card-title">{market.title}</div>
                    </div>
                    <div className="card-options">
                      {market.options.map((opt, i) => (
                        <div className="option-row" key={i}>
                          <span className="option-name">{opt.name}</span>
                          <div className="option-actions">
                            <span className="option-prob">{opt.percentage}</span>
                            <button className="btn-vote buy" onClick={(e) => { e.stopPropagation(); handleOpenMarketTrade(market, opt); }}>
                              Operar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {market.resolution && (
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-green)', fontWeight: 'bold' }}>
                        ✅ Resuelto: Ganó "{market.resolution.winningOption}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </main>
        )}

        {/* Modal de Polymarket */}
        <TradeMarketModal
          market={tradeMarketData?.market}
          optionData={tradeMarketData?.optionData}
          userPortfolio={userPortfolio}
          isOpen={!!tradeMarketData}
          onClose={() => setTradeMarketData(null)}
          onTrade={handleMarketTrade}
        />

        {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      </div>
    </SessionCtx.Provider>
  );
}

export default App;