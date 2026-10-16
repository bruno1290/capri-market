import { FRIENDS, BROS, HOES } from './data';

export const STARTING_CASH = 10;
export const DAILY_ALLOWANCE = 10;
export const LAUNCH_DATE = '2026-10-15';
export const COST_PER_VOTE = 1;
export const ADMIN_NAME = 'Gacela';
export const STOCK_HYPE_LIMIT = 20; // 20 clicks de Hype gratis por persona (límite vitalicio)
export const DAILY_VOTE_LIMIT = 10; // Variable residual para la UI

const INITIAL_STOCK_PRICE = 10.0; // Blindaje estricto del precio base

function matchesFriendName(optionName, friendName) {
  if (!optionName || !friendName) return false;
  return String(optionName).trim().toLowerCase() === String(friendName).trim().toLowerCase();
}

function matchesHoeTicker(optionName, ticker) {
  if (!optionName || !ticker) return false;
  const clean = String(optionName).trim().toUpperCase();
  return clean === ticker || clean.includes(ticker);
}

function getAccruedCash() {
  const launch = new Date(`${LAUNCH_DATE}T00:00:00`);
  const now = new Date();
  const daysElapsed = Math.max(0, Math.floor((now - launch) / (1000 * 60 * 60 * 24)));
  return STARTING_CASH + daysElapsed * DAILY_ALLOWANCE;
}

export function computeMarketEngine(votes = [], currentUserName = null) {
  const accruedCash = getAccruedCash();

  // 1. Inicialización de Acciones (Bros & Hoes)
  const stockLookup = {};
  const allStocks = [];

  [...(BROS || []), ...(HOES || [])].forEach(item => {
    const isHoe = item.id.startsWith('hoe');
    const leverage = item.leverage || (isHoe ? 5 : 1);

    const s = {
      ...item,
      type: isHoe ? 'hoe' : 'bro',
      price: INITIAL_STOCK_PRICE,
      change: 0,
      votes: 0,
      buyVolume: 0,
      sellVolume: 0,
      tradesCount: 0,
      netShares: 0,        // Driver 1: Oferta vs Demanda real
      hypeCount: 0,        // Driver 2: Hype clicks (gratis)
      pollVotesCount: 0,   // Driver 3: Efecto cruzado de votaciones
      leverage: leverage,
      sparkline: [INITIAL_STOCK_PRICE]
    };
    stockLookup[s.id] = s;
    allStocks.push(s);
  });

  // 2. Inicialización de Carteras (Portafolios)
  const portfolios = {};
  const ensurePortfolio = (name) => {
    if (!portfolios[name]) {
      portfolios[name] = {
        name: name,
        cash: accruedCash,
        netWorth: accruedCash,
        totalProfit: 0,
        totalProfitPercent: 0,
        positions: {}, // Estructura: { stockId: { shares, totalInvested } }
        tradesCount: 0,
        hypeClicksRemaining: STOCK_HYPE_LIMIT,
        votesRemainingToday: DAILY_VOTE_LIMIT
      };
    }
    return portfolios[name];
  };

  (FRIENDS || []).forEach(f => ensurePortfolio(f));
  if (currentUserName) ensurePortfolio(currentUserName);

  // Rastreadores de Votaciones de Encuestas
  const resolvedMarkets = {};
  const marketBets = {};

  // FÓRMULA MAESTRA DE FIJACIÓN DE PRECIOS
  const updateStockPrice = (stock) => {
    // 1. Presión de Mercado: Acciones netas en circulación * Apalancamiento * $0.05
    const marketPressure = stock.netShares * stock.leverage * 0.05;

    // 2. Presión de Hype: $0.02 por cada clic de "inflar"
    const hypePressure = stock.hypeCount * 0.02;

    // 3. Presión de Votación: $0.10 por cada voto de encuesta a su nombre
    const pollPressure = stock.pollVotesCount * 0.10;

    // Se suman las presiones al precio base ($10)
    let newPrice = INITIAL_STOCK_PRICE + marketPressure + hypePressure + pollPressure;
    newPrice = Math.max(1.0, newPrice); // Blindaje: El precio no puede caer a 0, mínimo $1.00

    stock.price = +newPrice.toFixed(2);
    stock.change = +(((stock.price - INITIAL_STOCK_PRICE) / INITIAL_STOCK_PRICE) * 100).toFixed(1);

    stock.sparkline.push(stock.price);
    if (stock.sparkline.length > 20) stock.sparkline.shift();
  };

  // 3. Reconstrucción Cronológica de la Economía
  (votes || []).forEach(evt => {
    if (!evt || !evt.voter_name) return;
    const voter = evt.voter_name;
    const p = ensurePortfolio(voter);

    // --- EVENTO A: VOTACIÓN EN ENCUESTA ($1) ---
    if (evt.vote_type === 'market') {
      if (resolvedMarkets[evt.target_id]) return;
      if (p.cash < COST_PER_VOTE) return; // Se rechaza si no hay liquidez

      p.cash = +(p.cash - COST_PER_VOTE).toFixed(2);

      // Sumar al pozo de la encuesta
      if (!marketBets[evt.target_id]) marketBets[evt.target_id] = { total: 0, voters: [] };
      marketBets[evt.target_id].total += 1;
      marketBets[evt.target_id].voters.push({ voter, option: evt.option_name });

      // EFECTO CRUZADO: Buscar si la opción votada es un Bro o Hoe y subir su precio
      allStocks.forEach(stock => {
        if (stock.type === 'bro' && matchesFriendName(evt.option_name, stock.name)) {
          stock.pollVotesCount += 1;
          updateStockPrice(stock);
        } else if (stock.type === 'hoe' && matchesHoeTicker(evt.option_name, stock.ticker)) {
          stock.pollVotesCount += 1;
          updateStockPrice(stock);
        }
      });
    }

    // --- EVENTO B: RESOLVER ENCUESTA ---
    else if (evt.vote_type === 'resolve_market') {
      const marketId = evt.target_id;
      if (resolvedMarkets[marketId]) return;

      const bets = marketBets[marketId] || { total: 0, voters: [] };
      const winningOption = evt.option_name;
      const winners = bets.voters.filter(v => v.option === winningOption);
      const pot = +(bets.total * COST_PER_VOTE).toFixed(2);
      const payoutPerVote = winners.length > 0 ? +(pot / winners.length).toFixed(2) : 0;

      // Distribuir el pozo a los ganadores
      winners.forEach(w => {
        const winnerPort = ensurePortfolio(w.voter);
        winnerPort.cash = +(winnerPort.cash + payoutPerVote).toFixed(2);
      });

      resolvedMarkets[marketId] = {
        winningOption, pot, payoutPerVote, winnersCount: winners.length
      };
    }

    // --- EVENTO C: INFLAR ACCIÓN (Hype Gratis) ---
    else if (evt.vote_type === 'stock') {
      if (p.hypeClicksRemaining <= 0) return;
      const stock = stockLookup[evt.target_id];
      if (stock) {
        p.hypeClicksRemaining -= 1;
        stock.hypeCount += 1;
        stock.votes += 1; // Contador para la UI
        updateStockPrice(stock);
      }
    }

    // --- EVENTO D: TRADING DE ACCIONES (Compra/Venta) ---
    else if (evt.vote_type === 'trade') {
      const stock = stockLookup[evt.target_id];
      if (!stock) return;

      let trade;
      try { trade = typeof evt.option_name === 'string' ? JSON.parse(evt.option_name) : evt.option_name; }
      catch (e) { return; }

      if (!p.positions[stock.id]) {
        p.positions[stock.id] = { shares: 0, totalInvested: 0 };
      }
      const pos = p.positions[stock.id];

      if (trade.action === 'BUY') {
        const amountToInvest = Number(trade.amount);
        if (amountToInvest <= 0 || p.cash < amountToInvest) return; // Sin liquidez

        // El motor backend calcula las acciones exactas según el precio de ese milisegundo
        const sharesBought = amountToInvest / stock.price;

        p.cash = +(p.cash - amountToInvest).toFixed(2);
        pos.shares = +(pos.shares + sharesBought).toFixed(4);
        pos.totalInvested = +(pos.totalInvested + amountToInvest).toFixed(2);

        stock.buyVolume += amountToInvest;
        stock.tradesCount += 1;
        stock.netShares += sharesBought;
        p.tradesCount += 1;

        // Empujar precio hacia arriba
        updateStockPrice(stock);

      } else if (trade.action === 'SELL') {
        let sharesToSell = Number(trade.shares);
        if (sharesToSell <= 0 || pos.shares <= 0) return;

        // Blindaje: No puede vender más de lo que tiene
        if (sharesToSell > pos.shares) sharesToSell = pos.shares;

        const saleValue = sharesToSell * stock.price;

        p.cash = +(p.cash + saleValue).toFixed(2);

        // Promediar la inversión restante
        const ratio = (pos.shares - sharesToSell) / pos.shares;
        pos.shares = +(pos.shares - sharesToSell).toFixed(4);
        pos.totalInvested = +(pos.totalInvested * ratio).toFixed(2);

        // Limpiar polvo matemático (floats)
        if (pos.shares < 0.0001) {
          pos.shares = 0;
          pos.totalInvested = 0;
        }

        stock.sellVolume += saleValue;
        stock.tradesCount += 1;
        stock.netShares -= sharesToSell;
        p.tradesCount += 1;

        // Empujar precio hacia abajo
        updateStockPrice(stock);
      }
    }
  });

  // 4. Valoración del Portafolio y Ganancia No Realizada (PnL)
  Object.values(portfolios).forEach(p => {
    let stocksValue = 0;
    const formattedPositions = [];

    Object.entries(p.positions).forEach(([stockId, pos]) => {
      if (pos.shares > 0) {
        const stock = stockLookup[stockId];
        const currentValue = pos.shares * stock.price;
        const avgBuyPrice = pos.totalInvested / pos.shares;
        const pnl = currentValue - pos.totalInvested;
        const pnlPercent = pos.totalInvested > 0 ? (pnl / pos.totalInvested) * 100 : 0;

        stocksValue += currentValue;
        formattedPositions.push({
          stockId,
          stock,
          shares: pos.shares,
          totalInvested: pos.totalInvested,
          currentValue: +currentValue.toFixed(2),
          avgBuyPrice: +avgBuyPrice.toFixed(2),
          pnl: +pnl.toFixed(2),
          pnlPercent: +pnlPercent.toFixed(1)
        });
      }
    });

    // Aquí es donde la rentabilidad se actualiza aunque no hayan vendido
    p.stocksValue = +stocksValue.toFixed(2);
    p.netWorth = +(p.cash + stocksValue).toFixed(2);
    p.totalProfit = +(p.netWorth - accruedCash).toFixed(2);
    p.totalProfitPercent = +((p.totalProfit / accruedCash) * 100).toFixed(1);
    p.positionsList = formattedPositions.sort((a, b) => b.currentValue - a.currentValue);
  });

  // 5. Generar Ranking de Wall Street Capri
  const leaderboard = Object.values(portfolios)
    .sort((a, b) => b.netWorth - a.netWorth)
    .map((p, index) => {
      let tier = 'Novato';
      if (p.netWorth > accruedCash * 5) tier = 'Lobo de Wall St';
      else if (p.netWorth > accruedCash * 2) tier = 'Broker';
      else if (p.netWorth < accruedCash * 0.5) tier = 'Bancarrota';

      let badge = '📈';
      if (index === 0) badge = '👑';
      else if (index === 1) badge = '🥈';
      else if (index === 2) badge = '🥉';
      else if (p.netWorth < accruedCash) badge = '📉';

      return {
        rank: index + 1,
        name: p.name,
        netWorth: p.netWorth,
        totalProfit: p.totalProfit,
        totalProfitPercent: p.totalProfitPercent,
        tier,
        badge,
        tradesCount: p.tradesCount,
        positions: p.positionsList
      };
    });

  return {
    bros: Array.isArray(allStocks) ? allStocks.filter(s => s.type === 'bro').sort((a, b) => b.change - a.change) : [],
    hoes: Array.isArray(allStocks) ? allStocks.filter(s => s.type === 'hoe').sort((a, b) => b.change - a.change) : [],
    allStocks: Array.isArray(allStocks) ? allStocks.sort((a, b) => b.change - a.change) : [],
    stockLookup: stockLookup || {},
    portfolios: portfolios || {},
    leaderboard: Array.isArray(leaderboard) ? leaderboard : [],
    userPortfolio: (currentUserName && portfolios && portfolios[currentUserName]) ? portfolios[currentUserName] : { cash: accruedCash, netWorth: accruedCash, positions: {} },
    resolvedMarkets: resolvedMarkets || {}
  };
}