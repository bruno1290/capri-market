import { FRIENDS, BROS, HOES } from './data';

export const STARTING_CASH = 10;
export const DAILY_ALLOWANCE = 10;
export const LAUNCH_DATE = '2026-10-15';
export const COST_PER_VOTE = 1;
export const ADMIN_NAME = 'Gacela';
export const DAILY_VOTE_LIMIT = 20;

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Every friend gets $10 on launch day, plus $10 more for each day that has passed since.
function getAccruedCash() {
  const launch = new Date(`${LAUNCH_DATE}T00:00:00`);
  const now = new Date();
  const daysElapsed = Math.max(0, Math.floor((now - launch) / (1000 * 60 * 60 * 24)));
  return STARTING_CASH + daysElapsed * DAILY_ALLOWANCE;
}

/**
 * Computes live stock prices, user holdings, and friend leaderboard
 * based on all recorded events in Supabase (votes table).
 */
export function computeMarketEngine(votes = [], currentUserName = null) {
  const accruedCash = getAccruedCash();
  const todayKey = getTodayKey();

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
      cash: accruedCash,
      holdings: {}, // { [stockId]: { shares: 0, totalInvested: 0 } }
      tradesCount: 0,
      pollVotesCount: 0
    };
  });

  // Also ensure current logged-in user has a portfolio entry
  if (currentUserName && !portfolios[currentUserName]) {
    portfolios[currentUserName] = {
      name: currentUserName,
      cash: accruedCash,
      holdings: {},
      tradesCount: 0,
      pollVotesCount: 0
    };
  }


  // Track every bet placed on each market so we can pay out winners on resolution
  const marketBets = {}; // { [marketId]: { total: 0, voters: [{ voter, option }] } }
  const resolvedMarkets = {}; // { [marketId]: { winningOption, pot, payoutPerVote, winnersCount, totalVotes, resolvedBy, resolvedAt } }
  const votesToday = {}; // { [voter]: count } — only counts votes cast today, resets naturally each day

  // Process all events sequentially
  votes.forEach(evt => {
    const voter = evt.voter_name;

    // --- EVENT TYPE: Poll Vote in Market ---
    if (evt.vote_type === 'market') {
      if (resolvedMarkets[evt.target_id]) return; // market already resolved, ignore late bets

      const isToday = evt.created_at && String(evt.created_at).slice(0, 10) === todayKey;
      if (isToday) {
        votesToday[voter] = votesToday[voter] || 0;
        if (votesToday[voter] >= DAILY_VOTE_LIMIT) return; // daily vote limit reached, ignore
        votesToday[voter] += 1;
      }

      if (portfolios[voter]) {
        portfolios[voter].cash = Math.max(0, +(portfolios[voter].cash - COST_PER_VOTE).toFixed(2));
        portfolios[voter].pollVotesCount += 1;
      }

      if (!marketBets[evt.target_id]) marketBets[evt.target_id] = { total: 0, voters: [] };
      marketBets[evt.target_id].total += 1;
      marketBets[evt.target_id].voters.push({ voter, option: evt.option_name });
      // Poll votes in a market only move that market's own odds — they no longer
      // valorize Bro/Hoe stock prices. Stocks move only via 'stock' votes or trades.
    }

    // --- EVENT TYPE: Admin resolves a market, paying out winners ---
    else if (evt.vote_type === 'resolve_market') {
      const marketId = evt.target_id;
      if (resolvedMarkets[marketId]) return; // already resolved, ignore duplicates

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
    const totalProfit = +(netWorth - accruedCash).toFixed(2);
    const totalProfitPercent = +((totalProfit / accruedCash) * 100).toFixed(1);

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
    cash: accruedCash,
    stocksValue: 0,
    netWorth: accruedCash,
    totalProfit: 0,
    totalProfitPercent: 0,
    positions: [],
    tradesCount: 0,
    pollVotesCount: 0
  };

  const votesUsedToday = votesToday[currentUserName] || 0;
  userPortfolio.votesUsedToday = votesUsedToday;
  userPortfolio.votesRemainingToday = Math.max(0, DAILY_VOTE_LIMIT - votesUsedToday);

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
