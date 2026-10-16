import { INITIAL_MARKETS, BROS, HOES } from './data';

export const STARTING_CASH = 30;
export const DAILY_ALLOWANCE = 30;
export const COST_PER_VOTE = 1; // Ya no se usa para encuestas, pero lo dejamos por si acaso
export const ADMIN_NAME = "Gacela";
export const DAILY_VOTE_LIMIT = 5;
export const STOCK_HYPE_LIMIT = 20;

export const computeMarketEngine = (votes, currentUserName) => {
  const stockLookup = {};
  const users = {};
  const customMarkets = {};
  const resolvedMarkets = {};

  // 1. Inicializar todas las acciones (Bros y Hoes)
  [...BROS, ...HOES].forEach(s => {
    stockLookup[s.id] = {
      ...s,
      price: s.basePrice,
      change: 0,
      tradesCount: 0,
      votes: 0,
      sparkline: [...s.sparkline]
    };
  });

  const getOrCreateUser = (name) => {
    if (!users[name]) {
      users[name] = {
        name,
        cash: STARTING_CASH,
        hypeClicksRemaining: STOCK_HYPE_LIMIT,
        positions: {},       // Posiciones de acciones (Bros/Hoes)
        marketPositions: {}  // Posiciones de predicciones (Polymarket)
      };
    }
    return users[name];
  };

  // 2. Procesar todos los eventos cronológicamente
  const sortedVotes = [...votes].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  sortedVotes.forEach(event => {
    const user = getOrCreateUser(event.voter_name);
    const dayOfEvent = event.created_at ? event.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10);

    // Bono diario (simplificado para el motor)
    if (!user.lastBonusDay) {
      user.lastBonusDay = dayOfEvent;
    } else if (user.lastBonusDay !== dayOfEvent) {
      user.cash += DAILY_ALLOWANCE;
      user.hypeClicksRemaining = STOCK_HYPE_LIMIT;
      user.lastBonusDay = dayOfEvent;
    }

    // A. CREAR MERCADO PERSONALIZADO
    if (event.vote_type === 'create_market') {
      try {
        const m = typeof event.target_id === 'string' ? JSON.parse(event.target_id) : event.target_id;
        // Liquidez inicial para Polymarket: 20 "dólares" a cada opción
        const polymarketOptions = m.options.map(opt => ({
          ...opt,
          liquidity: 40
        }));
        customMarkets[m.id] = { ...m, options: polymarketOptions };
      } catch (e) {
        console.error("Error parseando mercado custom:", e);
      }
    }

    // B. RESOLVER MERCADO (Admin)
    if (event.vote_type === 'resolve_market') {
      resolvedMarkets[event.target_id] = {
        winningOption: event.option_name,
        resolvedAt: event.created_at
      };

      // El motor debería liquidar los contratos aquí a $1.00 si ganaron, 
      // pero para mantenerlo simple y real-time, el valor se refleja en el UI
      // cuando el mercado está resuelto.
    }

    // C. TRADING DE PREDICCIONES (Polymarket)
    if (event.vote_type === 'trade_market') {
      try {
        const payload = typeof event.option_name === 'string' ? JSON.parse(event.option_name) : event.option_name;
        const { action, amount, shares, price, optionName } = payload;
        const marketId = event.target_id;

        const mPosKey = `${marketId}_${optionName}`;
        if (!user.marketPositions[mPosKey]) {
          user.marketPositions[mPosKey] = { marketId, optionName, shares: 0, invested: 0 };
        }

        if (action === 'BUY' && user.cash >= amount) {
          user.cash -= amount;
          user.marketPositions[mPosKey].shares += shares;
          user.marketPositions[mPosKey].invested += amount;

          // Actualizar liquidez en el mercado custom (si existe) para ajustar precios
          if (customMarkets[marketId]) {
            const opt = customMarkets[marketId].options.find(o => o.name === optionName);
            if (opt) opt.liquidity += amount;
          }
        } else if (action === 'SELL' && user.marketPositions[mPosKey].shares > 0) {
          const sellShares = Math.min(shares, user.marketPositions[mPosKey].shares);
          const sellValue = amount; // Lo que el usuario recibe

          user.cash += sellValue;
          user.marketPositions[mPosKey].shares -= sellShares;
          user.marketPositions[mPosKey].invested -= sellValue; // aproximación de retiro

          if (customMarkets[marketId]) {
            const opt = customMarkets[marketId].options.find(o => o.name === optionName);
            if (opt) opt.liquidity = Math.max(1, opt.liquidity - sellValue);
          }
        }
      } catch (e) {
        console.error("Error en trade_market:", e);
      }
    }

    // D. VOTO CLÁSICO (Hype de Acciones o Mercados antiguos)
    if (event.vote_type === 'market') {
      // Soporte legado por si hay votos antiguos en la BD
      if (user.cash >= COST_PER_VOTE) {
        user.cash -= COST_PER_VOTE;
      }
    }

    // E. TRADING DE ACCIONES (Bros & Hoes)
    if (event.vote_type === 'trade') {
      try {
        const payload = typeof event.option_name === 'string' ? JSON.parse(event.option_name) : event.option_name;
        const { action, amount, shares } = payload;
        const s = stockLookup[event.target_id];