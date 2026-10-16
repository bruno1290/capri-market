import React, { useState, useMemo, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { Search, TrendingUp, TrendingDown, Clock, BarChart2, MessageCircle, Gift, Bookmark, ArrowLeft, Star, ChevronUp, Zap, Users, Heart, DollarSign, LogOut, PlusCircle, X, Briefcase, Award, Plus } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { INITIAL_MARKETS, FRIENDS, BROS, HOES } from './data';
import { computeMarketEngine, STARTING_CASH, DAILY_ALLOWANCE, ADMIN_NAME, STOCK_HYPE_LIMIT } from './marketEngine';
import { supabase } from './supabase';
import './index.css';

function RulesBanner() {
  // Usamos localStorage para que si lo cierran, no les vuelva a salir cada vez que recargan la página
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

function saveSession(session) { localStorage.setItem('capri-session-v2', JSON.stringify(session)); }

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

// ── COMPONENTES BASE (Omitidos los que no cambian para brevedad) ──
// Asume que Sparkline, LoginScreen, Toast, Header, NavCategories,