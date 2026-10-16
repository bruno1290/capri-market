import { FRIENDS, BROS, HOES } from './data';

export const STARTING_CASH = 10;
export const DAILY_ALLOWANCE = 10;
export const LAUNCH_DATE = '2026-10-15';
export const COST_PER_VOTE = 1;
export const ADMIN_NAME = 'Gacela';
export const STOCK_HYPE_LIMIT = 10; // free "inflate" clicks per person, no price cost, lifetime cap
const PROBABILITY_DRIVER_WEIGHT = 1.5; // how hard poll-vote popularity moves a stock's price

function matchesFriendName(optionName, friendName) {
  if (!optionName || !friendName) return false;
  return String(optionName).trim().toLowerCase() === String(friendName).trim().toLowerCase();
}

function matchesHoeTicker(optionName, ticker) {
  if (!optionName || !ticker) return false;
  const clean = String(optionName).trim().toUpperCase();
  return clean === ticker || clean.includes(ticker);
}

// Acciones BROS y HOES base (Asegúrate de que BROS y HOES tengan un .id único en tu data.js)
function getAccruedCash() {
  const launch = new Date(`${LAUNCH_DATE}T00:00:00`);
  const now = new Date();
  const daysElapsed = Math.max(0, Math.floor((now - launch) / (1000 * 60 * 60 * 24)));
  return STARTING_CASH + daysElapsed * DAILY_ALLOWANCE;
}

/**
 * Motor robusto que computa los precios, carteras y ranking.
 */
export function computeMarketEngine(votes = [], currentUserName = null) {
  const accruedCash = getAccruedCash();

  // 1. Inicialización segura de mercados
  const brosMap = {};
  (BROS || []).forEach(b => {
    brosMap[b.id] = {
      ...b,
      price: Number(b.basePrice || b.price) || 1,
      change: 0,
      votes: 0,
      buyVolume: 0,
      sellVolume: 0,
      tradesCount: 0,
      sparkline: b.sparkline && Array.isArray(b.sparkline) ? [...b.sparkline] : [Number(b.basePrice || b.price) || 1]
    };
  });

  const hoesMap = {};
  (HOES || []).forEach(h => {
    hoesMap[h.id] = {
      ...h,
      price: Number(h.basePrice || h.price) || 1,
      change: 0,
      votes: 0,
      buyVolume: 0,
      sellVolume: 0,
      tradesCount: 0,
      sparkline: h.sparkline && Array.isArray(h.sparkline) ? [...h.sparkline] : [Number(h.basePrice || h.price) || 1]
    };
  });

  // 2. Inicialización de Portafolios
  const portfolios = {};
  (FRIENDS || []).forEach(friend => {
    portfolios[friend] = {
      name: friend,
      cash: accruedCash,
      holdings: {},
      tradesCount: 0,
      pollVotesCount: 0
    };
  });

  // Asegurar que el usuario actual tenga portafolio incluso si no está en FRIENDS
  if (currentUserName && !portfolios[currentUserName]) {
    portfolios[currentUserName] = {
      name: currentUserName,
      cash: accruedCash,
      holdings: {},
      tradesCount: 0,
      pollVotesCount: 0
    };
  }

  // 3. Estructuras de rastreo
  const marketBets = {};
  const resolvedMarkets = {};
  const hypeClicks = {};

  // 4. Procesamiento secuencial a prueba de fallos
  (votes || []).forEach(evt => {
    if (!evt || !evt.voter_name) return; // Ignorar eventos corruptos

    const voter = evt.voter_name;

    // --- EVENT TYPE: Poll Vote in Market ---
    if (evt.vote_type === 'market') {
      if (resolvedMarkets[evt.target_id]) return; // Mercado cerrado

      if (portfolios[voter]) {
        // Validación Robusta: Bloquear si no hay saldo suficiente
        if (portfolios[voter].cash < COST_PER_VOTE) return;

        portfolios[voter].cash = +(portfolios[voter].cash - COST_PER_VOTE).toFixed(2);
        portfolios[voter].pollVotesCount += 1;
      }

      if (!marketBets[evt.target_id]) {
        marketBets[evt.target_id] = { total: 0, voters: [] };
      }
      marketBets[evt.target_id].total += 1;
      marketBets[evt.target_id].voters.push({ voter, option: evt.option_name });
    }

    // --- EVENT TYPE: Resolve Market ---
    else if (evt.vote_type === 'resolve_market') {
      const marketId = evt.target_id;
      if (resolvedMarkets[marketId]) return; // Evitar pagos duplicados

      const bets = marketBets[marketId] || { total: 0, voters: [] };
      const winningOption = evt.option_name;
      const winners = bets.voters.filter(v => v.option === winningOption);
      const pot = +(bets.total * COST_PER_VOTE).toFixed(2);
      const payoutPerVote = winners.length > 0 ? +(pot / winners.length).toFixed(2) : 0;

      winners.forEach(w => {
        if (portfolios[w.voter]) {
          portfolios[w.voter].cash = +(portfolios[w.voter].cash + payoutPerVote).toFixed(2);
        }
      });

      resolvedMarkets[marketId] = {
        winningOption,
        pot,
        payoutPerVote,
        winnersCount: winners.length,
        totalVotes: bets.total,
        resolvedBy: evt.voter_name,
        resolvedAt: evt.created_at
      };
    }

    // --- EVENT TYPE: Direct Stock Vote (Hype Clicks) ---
    else if (evt.vote_type === 'stock') {
      hypeClicks[voter] = hypeClicks[voter] || 0;
      if (hypeClicks[voter] >= STOCK_HYPE_LIMIT) return; // Límite vitalicio alcanzado

      const stock = brosMap[evt.target_id] || hoesMap[evt.target_id];
      if (stock) {
        hypeClicks[voter] += 1; // Solo contar si la acción existe
        stock.votes += 1;
        const rate = stock.id.startsWith('bro') ? 0.03 : 0.05;
        const bump = +(stock.price * rate).toFixed(2);
        stock.price = +(stock.price + Math.max(0.25, bump)).toFixed(2);
        stock.sparkline.push(stock.price);
        if (stock.sparkline.length > 20) stock.sparkline.shift();
      }
    }

    // --- EVENT TYPE: Stock Trade ---
    else if (evt.vote_type === 'trade') {
      const stock = brosMap[evt.target_id] || hoesMap[evt.target_id];
      if (!stock) return; // Acción inválida

      let trade = null;
      try {
        trade = typeof evt.option_name === 'string' ? JSON.parse(evt.option_name) : evt.option_name;
      } catch (err) {
        return; // Ignorar trades malformados
      }

      if (trade && portfolios[voter]) {
        const action = trade.action;
        const amount = Number(trade.amount) || 0;
        const shares = Number(trade.shares) || 0;
        if (amount <= 0 || shares <= 0) return; // Evitar bugs matemáticos

        const isHoe = stock.id.startsWith('hoe');
        const buySens = isHoe ? 0.035 : 0.02;
        const sellSens = isHoe ? 0.025 : 0.015;

        if (action === 'BUY') {
          // Validar saldo para compra
          if (portfolios[voter].cash < amount) return;

          stock.tradesCount += 1;
          stock.buyVolume += amount;
          const pct = (amount / 10) * buySens;
          const bump = +(stock.price * pct).toFixed(2);
          stock.price = +(stock.price + Math.max(0.20, bump)).toFixed(2);

          portfolios[voter].cash = Math.max(0, +(portfolios[voter].cash - amount).toFixed(2));
          if (!portfolios[voter].holdings[stock.id]) {
            portfolios[voter].holdings[stock.id] = { shares: 0, totalInvested: 0 };
          }
          portfolios[voter].holdings[stock.id].shares = +(portfolios[voter].holdings[stock.id].shares + shares).toFixed(4);
          portfolios[voter].holdings[stock.id].totalInvested = +(portfolios[voter].holdings[stock.id].totalInvested + amount).toFixed(2);
          portfolios[voter].tradesCount += 1;
        }
        else if (action === 'SELL') {
          // Validar que tenga la acción
          const h = portfolios[voter].holdings[stock.id];
          if (!h || h.shares < shares) return; // No puede vender lo que no tiene

          stock.tradesCount += 1;
          stock.sellVolume += amount;
          const pct = (amount / 10) * sellSens;
          const dip = +(stock.price * pct).toFixed(2);
          stock.price = Math.max(1.0, +(stock.price - dip).toFixed(2)); // Piso de $1.0

          portfolios[voter].cash = +(portfolios[voter].cash + amount).toFixed(2);
          const remainingShares = Math.max(0, +(h.shares - shares).toFixed(4));

          if (remainingShares === 0) {
            h.shares = 0;
            h.totalInvested = 0;
          } else {
            const ratio = remainingShares / (h.shares || 1);
            h.shares = remainingShares;
            h.totalInvested = +(h.totalInvested * ratio).toFixed(2);
          }
          portfolios[voter].tradesCount += 1;
        }

        stock.sparkline.push(stock.price);
        if (stock.sparkline.length > 20) stock.sparkline.shift();
      }
    }
  });

  // 5. Driver de Probabilidad
  const allPollVotes = Object.values(marketBets).flatMap(mb => mb.voters);
  const totalPollVotes = allPollVotes.length;

  const applyProbabilityDriver = (stock, count, baselineShare) => {
    const share = totalPollVotes > 0 ? count / totalPollVotes : baselineShare;
    const deviation = baselineShare > 0 ? (share - baselineShare) / baselineShare : 0;
    const multiplier = Math.max(0.3, Math.min(3, 1 + PROBABILITY_DRIVER_WEIGHT * deviation));
    stock.price = Math.max(1.0, +(stock.price * multiplier).toFixed(2));
    stock.pollShare = +(share * 100).toFixed(1);
    stock.sparkline.push(stock.price);
    if (stock.sparkline.length > 20) stock.sparkline.shift();
  };

  const broBaselineShare = 1 / (FRIENDS.length || 1);
  Object.values(brosMap).forEach(bro => {
    const count = allPollVotes.filter(v => matchesFriendName(v.option, bro.name)).length;
    applyProbabilityDriver(bro, count, broBaselineShare);
  });

  const hoeBaselineShare = 1 / (HOES.length || 1);
  Object.values(hoesMap).forEach(hoe => {
    const count = allPollVotes.filter(v => matchesHoeTicker(v.option, hoe.ticker)).length;
    applyProbabilityDriver(hoe, count, hoeBaselineShare);
  });

  // 6. Consolidación de Resultados
  const allStocksList = [...Object.values(brosMap), ...Object.values(hoesMap)].map(s => {
    const base = Number(s.basePrice || s.price) || 1;
    const change = +(((s.price - base) / base) * 100).toFixed(1);
    return { ...s, change };
  });

  const finalBros = allStocksList.filter(s => s.id.startsWith('bro'));
  const finalHoes = allStocksList.filter(s => s.id.startsWith('hoe'));
  const stockLookup = Object.fromEntries(allStocksList.map(s => [s.id, s]));

  // 7. Enriquecer carteras y Leaderboard
  const enrichedPortfolios = Object.entries(portfolios).map(([name, p]) => {
    let stocksValue = 0;
    const detailedPositions = [];

    Object.entries(p.holdings).forEach(([stockId, holding]) => {
      if (holding.shares > 0.0001) {
        const stock = stockLookup[stockId];
        if (stock) {
          const currentValue = +(holding.shares * stock.price).toFixed(2);
          stocksValue += currentValue;
          const pnl = +(currentValue - holding.totalInvested).toFixed(2);
          const pnlPercent = holding.totalInvested > 0 ? +((pnl / holding.totalInvested) * 100).toFixed(1) : 0;

          detailedPositions.push({
            stockId,
            stock,
            shares: holding.shares,
            totalInvested: holding.totalInvested,
            currentValue,
            pnl,
            pnlPercent,
            avgBuyPrice: +(holding.totalInvested / holding.shares).toFixed(2)
          });
        }
      }
    });

    stocksValue = +stocksValue.toFixed(2);
    const netWorth = +(p.cash + stocksValue).toFixed(2);
    const totalProfit = +(netWorth - accruedCash).toFixed(2);
    const totalProfitPercent = +((totalProfit / accruedCash) * 100).toFixed(1);

    return { ...p, stocksValue, netWorth, totalProfit, totalProfitPercent, positions: detailedPositions };
  });

  const leaderboard = [...enrichedPortfolios].sort((a, b) => b.netWorth - a.netWorth).map((item, index) => {
    let tier = 'Trader';
    let badge = '💼';
    if (index === 0 && item.totalProfit > 0) { tier = 'Lobo de Capri 👑'; badge = '🥇'; }
    else if (index === 1 && item.totalProfit > 0) { tier = 'Ballena Financiera 🐋'; badge = '🥈'; }
    else if (index === 2 && item.totalProfit > 0) { tier = 'Tiburón de Wall St 🦈'; badge = '🥉'; }
    else if (item.totalProfit > 15) { tier = 'En Ganancias 🚀'; badge = '🔥'; }
    else if (item.totalProfit < -20) { tier = 'En Quiebra 📉'; badge = '💀'; }

    return { ...item, rank: index + 1, tier, badge };
  });

  // 8. Portafolio del usuario actual
  const userPortfolio = enrichedPortfolios.find(p => p.name === currentUserName) || {
    name: currentUserName || 'Invitado',
    cash: accruedCash,
    stocksValue: 0,
    netWorth: accruedCash,
    totalProfit: 0,
    totalProfitPercent: 0,
    positions: [],
    tradesCount: 0,
    pollVotesCount: 0
  };

  // Cálculo de votos dinámico basado en efectivo disponible
  userPortfolio.votesRemainingToday = Math.floor(userPortfolio.cash / COST_PER_VOTE);

  const hypeClicksUsed = hypeClicks[currentUserName] || 0;
  userPortfolio.hypeClicksUsed = hypeClicksUsed;
  userPortfolio.hypeClicksRemaining = Math.max(0, STOCK_HYPE_LIMIT - hypeClicksUsed);

  return {
    bros: finalBros,
    hoes: finalHoes,
    allStocks: allStocksList,
    leaderboard,
    userPortfolio,
    stockLookup,
    resolvedMarkets
  };
}
