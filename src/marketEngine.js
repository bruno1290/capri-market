import { FRIENDS, BROS, HOES } from './data';

export const STARTING_CASH = 100;
export const COST_PER_VOTE = 1;

/**
 * Computes live stock prices, user holdings, and friend leaderboard
 * based on all recorded events in Supabase (votes table).
 */
export function computeMarketEngine(votes = [], currentUserName = null) {
  // 1. Create a clean map of base stocks
  const brosMap = {};
  BROS.forEach(b => {
    brosMap[b.id] = {
      ...b,
      price: b.basePrice || b.price,
      change: 0,
      votes: 0,
      buyVolume: 0,
      sellVolume: 0,
      tradesCount: 0,
      sparkline: [...b.sparkline]
    };
  });

  const hoesMap = {};
  HOES.forEach(h => {
    hoesMap[h.id] = {
      ...h,
      price: h.basePrice || h.price,
      change: 0,
      votes: 0,
      buyVolume: 0,
      sellVolume: 0,
      tradesCount: 0,
      sparkline: [...h.sparkline]
    };
  });

  // Track portfolios for each friend in FRIENDS
  const portfolios = {};
  FRIENDS.forEach(friend => {
    portfolios[friend] = {
      name: friend,
      cash: STARTING_CASH,
      holdings: {}, // { [stockId]: { shares: 0, totalInvested: 0 } }
      tradesCount: 0,
      pollVotesCount: 0
    };
  });

  // Also ensure current logged-in user has a portfolio entry
  if (currentUserName && !portfolios[currentUserName]) {
    portfolios[currentUserName] = {
      name: currentUserName,
      cash: STARTING_CASH,
      holdings: {},
      tradesCount: 0,
      pollVotesCount: 0
    };
  }

  // Helper to find stock by name or initials
  const findBroByName = (name) => {
    if (!name) return null;
    const clean = String(name).trim().toLowerCase();
    return Object.values(brosMap).find(b => b.name.toLowerCase() === clean);
  };

  const findHoeByToken = (text) => {
    if (!text) return null;
    const clean = String(text).trim().toUpperCase();
    return Object.values(hoesMap).find(h => clean === h.ticker || clean.includes(h.ticker));
  };

  // Process all events sequentially
  votes.forEach(evt => {
    const voter = evt.voter_name;

    // --- EVENT TYPE: Poll Vote in Market ---
    if (evt.vote_type === 'market') {
      if (portfolios[voter]) {
        portfolios[voter].cash = Math.max(0, +(portfolios[voter].cash - COST_PER_VOTE).toFixed(2));
        portfolios[voter].pollVotesCount += 1;
      }

      // 1. If voted option corresponds to a Bro
      const bro = findBroByName(evt.option_name);
      if (bro) {
        bro.votes += 1;
        // Each vote bumps bro price by 3.5% (approx +$0.60 to +$1.00)
        const bump = +(bro.price * 0.035).toFixed(2);
        bro.price = +(bro.price + Math.max(0.35, bump)).toFixed(2);
        bro.sparkline.push(bro.price);
        if (bro.sparkline.length > 20) bro.sparkline.shift();
      }

      // 2. If voted option or target relates to Hoes (e.g. AC, Chiang, alternas)
      const optStr = String(evt.option_name || '');
      const hoe = findHoeByToken(optStr);
      if (hoe) {
        hoe.votes += 1;
        // Hoes high-volatility boost: +5.5%
        const bump = +(hoe.price * 0.055).toFixed(2);
        hoe.price = +(hoe.price + Math.max(0.50, bump)).toFixed(2);
        hoe.sparkline.push(hoe.price);
        if (hoe.sparkline.length > 20) hoe.sparkline.shift();
      }
    }

    // --- EVENT TYPE: Direct Stock Vote ---
    else if (evt.vote_type === 'stock') {
      const stock = brosMap[evt.target_id] || hoesMap[evt.target_id];
      if (stock) {
        stock.votes += 1;
        const rate = stock.id.startsWith('bro') ? 0.03 : 0.05;
        const bump = +(stock.price * rate).toFixed(2);
        stock.price = +(stock.price + Math.max(0.25, bump)).toFixed(2);
        stock.sparkline.push(stock.price);
        if (stock.sparkline.length > 20) stock.sparkline.shift();
      }
    }

    // --- EVENT TYPE: Stock Trade (Comprar / Vender) ---
    else if (evt.vote_type === 'trade') {
      const stock = brosMap[evt.target_id] || hoesMap[evt.target_id];
      let trade = null;
      try {
        trade = typeof evt.option_name === 'string' ? JSON.parse(evt.option_name) : evt.option_name;
      } catch (err) {
        console.error("Error parsing trade event:", err);
      }

      if (stock && trade) {
        stock.tradesCount += 1;
        const action = trade.action; // 'BUY' or 'SELL'
        const amount = Number(trade.amount) || 0;
        const shares = Number(trade.shares) || 0;

        // Sensitivities: Hoes have higher leverage and volatility
        const isHoe = stock.id.startsWith('hoe');
        const buySens = isHoe ? 0.035 : 0.02; // +3.5% vs +2.0% per $10
        const sellSens = isHoe ? 0.025 : 0.015;

        if (action === 'BUY') {
          stock.buyVolume += amount;
          const pct = (amount / 10) * buySens;
          const bump = +(stock.price * pct).toFixed(2);
          stock.price = +(stock.price + Math.max(0.20, bump)).toFixed(2);

          if (portfolios[voter]) {
            portfolios[voter].cash = Math.max(0, +(portfolios[voter].cash - amount).toFixed(2));
            if (!portfolios[voter].holdings[stock.id]) {
              portfolios[voter].holdings[stock.id] = { shares: 0, totalInvested: 0 };
            }
            portfolios[voter].holdings[stock.id].shares = +(portfolios[voter].holdings[stock.id].shares + shares).toFixed(4);
            portfolios[voter].holdings[stock.id].totalInvested = +(portfolios[voter].holdings[stock.id].totalInvested + amount).toFixed(2);
            portfolios[voter].tradesCount += 1;
          }
        } else if (action === 'SELL') {
          stock.sellVolume += amount;
          const pct = (amount / 10) * sellSens;
          const dip = +(stock.price * pct).toFixed(2);
          stock.price = Math.max(1.0, +(stock.price - dip).toFixed(2));

          if (portfolios[voter]) {
            portfolios[voter].cash = +(portfolios[voter].cash + amount).toFixed(2);
            if (portfolios[voter].holdings[stock.id]) {
              const h = portfolios[voter].holdings[stock.id];
              const remainingShares = Math.max(0, +(h.shares - shares).toFixed(4));
              if (remainingShares === 0) {
                h.shares = 0;
                h.totalInvested = 0;
              } else {
                const ratio = remainingShares / (h.shares || 1);
                h.shares = remainingShares;
                h.totalInvested = +(h.totalInvested * ratio).toFixed(2);
              }
            }
            portfolios[voter].tradesCount += 1;
          }
        }

        stock.sparkline.push(stock.price);
        if (stock.sparkline.length > 20) stock.sparkline.shift();
      }
    }
  });

  // Calculate final change percentages for all stocks
  const allStocksList = [...Object.values(brosMap), ...Object.values(hoesMap)].map(s => {
    const base = s.basePrice || s.price;
    const change = +(((s.price - base) / base) * 100).toFixed(1);
    return {
      ...s,
      change
    };
  });

  const finalBros = allStocksList.filter(s => s.id.startsWith('bro'));
  const finalHoes = allStocksList.filter(s => s.id.startsWith('hoe'));
  const stockLookup = Object.fromEntries(allStocksList.map(s => [s.id, s]));

  // Calculate portfolio totals and net worth
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
          const pnlPercent = holding.totalInvested > 0 
            ? +((pnl / holding.totalInvested) * 100).toFixed(1) 
            : 0;

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
    const totalProfit = +(netWorth - STARTING_CASH).toFixed(2);
    const totalProfitPercent = +((totalProfit / STARTING_CASH) * 100).toFixed(1);

    return {
      ...p,
      stocksValue,
      netWorth,
      totalProfit,
      totalProfitPercent,
      positions: detailedPositions
    };
  });

  // Sort leaderboard by Net Worth descending
  const leaderboard = [...enrichedPortfolios].sort((a, b) => b.netWorth - a.netWorth).map((item, index) => {
    let tier = 'Trader';
    let badge = '💼';
    if (index === 0 && item.totalProfit > 0) { tier = 'Lobo de Capri 👑'; badge = '🥇'; }
    else if (index === 1 && item.totalProfit > 0) { tier = 'Ballena Financiera 🐋'; badge = '🥈'; }
    else if (index === 2 && item.totalProfit > 0) { tier = 'Tiburón de Wall St 🦈'; badge = '🥉'; }
    else if (item.totalProfit > 15) { tier = 'En Ganancias 🚀'; badge = '🔥'; }
    else if (item.totalProfit < -20) { tier = 'En Quiebra 📉'; badge = '💀'; }

    return {
      ...item,
      rank: index + 1,
      tier,
      badge
    };
  });

  // Current user's specific portfolio
  const userPortfolio = enrichedPortfolios.find(p => p.name === currentUserName) || {
    name: currentUserName || 'Invitado',
    cash: STARTING_CASH,
    stocksValue: 0,
    netWorth: STARTING_CASH,
    totalProfit: 0,
    totalProfitPercent: 0,
    positions: [],
    tradesCount: 0,
    pollVotesCount: 0
  };

  return {
    bros: finalBros,
    hoes: finalHoes,
    allStocks: allStocksList,
    leaderboard,
    userPortfolio,
    stockLookup
  };
}
