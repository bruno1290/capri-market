export const FRIENDS = [
  "Pala",
  "Trompo",
  "Gacela",
  "Gaspar",
  "Joaco",
  "Mirko",
  "Marin",
  "Mati",
  "Nacho",
  "Ojeda",
  "Paulo",
  "Pablo",
  "Moncho"
];

// Helper to calculate odds
export const calculateOdds = (options) => {
  const totalShares = options.reduce((sum, opt) => sum + opt.shares, 0);
  return options.map(opt => ({
    ...opt,
    prob: totalShares === 0 ? 0 : (opt.shares / totalShares),
    percentage: totalShares === 0 ? "0%" : Math.round((opt.shares / totalShares) * 100) + "%",
    payout: totalShares === 0 ? 0 : (totalShares / opt.shares).toFixed(2)
  })).sort((a, b) => b.prob - a.prob);
};

// Seeded pseudo-random for reproducible charts
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// Generate realistic history for a market based on its current options
function generateMarketHistory(options, seed, days = 7) {
  const history = [];
  const rng = seededRandom(seed);
  
  // Create variations of shares going backwards in time
  let currentShares = options.map(o => o.shares);
  
  // We generate points backwards, then reverse
  for (let i = days; i >= 0; i--) {
    const total = currentShares.reduce((a, b) => a + b, 0);
    const point = {
      label: i === 0 ? 'Hoy' : `Hace ${i}d`,
      data: {}
    };
    
    options.forEach((opt, idx) => {
      // Calculate percentage for this option at this point in time
      point.data[opt.name] = total === 0 ? 0 : Math.round((currentShares[idx] / total) * 100);
      
      // Mutate shares for the *previous* day (so we subtract a random amount to simulate fewer shares in the past)
      // This means as time goes forward (from past to present), shares increase
      const change = Math.floor(rng() * (currentShares[idx] * 0.3)); // up to 30% change
      currentShares[idx] = Math.max(1, currentShares[idx] - change);
    });
    
    history.push(point);
  }
  
  return history;
}

export const INITIAL_MARKETS = [
  {
    id: 1,
    title: "¿Quién come más en los 5 años?",
    category: "Tendencia",
    emoji: "🍔",
    volume: "$24.5K Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: 50 }))
  },
  {
    id: 2,
    title: "¿Quién queda más borrado en los 5 años?",
    category: "Fiesta",
    emoji: "🥴",
    volume: "$12.5K Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: 50 }))
  },
  {
    id: 5,
    title: "¿Quién se come a AC?",
    category: "Salseo",
    emoji: "🔥",
    volume: "$8K Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: 50 }))
  },
  {
    id: 6,
    title: "¿Quién se come mina pololeando?",
    category: "Salseo",
    emoji: "💀",
    volume: "$4.2K Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: 50 }))
  },
  {
    id: 7,
    title: "¿Quién baja el pozo?",
    category: "Fiesta",
    emoji: "🍺",
    volume: "$6.8K Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: 50 }))
  },
  {
    id: 8,
    title: "¿Quién le roba la mina a Mati?",
    category: "Salseo",
    emoji: "😈",
    volume: "$15K Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.filter(f => f !== "Mati").map(f => ({ name: f, shares: 50 }))
  },
  {
    id: 9,
    title: "¿Peshe se come a Chiang?",
    category: "Salseo",
    emoji: "👀",
    volume: "$9.3K Vol.",
    endDate: "17 de Octubre",
    options: [
      { name: "Sí", shares: 50 },
      { name: "No", shares: 50 }
    ]
  },
  {
    id: 10,
    title: "¿Antonio López sigue hablando con la E?",
    category: "Salseo",
    emoji: "📱",
    volume: "$5.5K Vol.",
    endDate: "17 de Octubre",
    options: [
      { name: "Sí", shares: 50 },
      { name: "No", shares: 50 }
    ]
  },
  {
    id: 11,
    title: "¿Pala y Mati pescarán a los amigos o se irán con las alternas?",
    category: "Random",
    emoji: "🤔",
    volume: "$7.1K Vol.",
    endDate: "17 de Octubre",
    options: [
      { name: "Pescan a los amigos", shares: 50 },
      { name: "Se van con las alternas", shares: 50 }
    ]
  }
].map((market, idx) => ({
  ...market,
  history: generateMarketHistory(market.options, idx * 99 + 7)
}));

// ── Acciones ──────────────────────────────────────────────

function generateSparkline(base, seed) {
  const rng = seededRandom(seed);
  const pts = [base];
  for (let i = 1; i < 14; i++) {
    const delta = (rng() - 0.45) * base * 0.06;
    pts.push(Math.max(1, +(pts[i - 1] + delta).toFixed(2)));
  }
  return pts;
}

export const BROS = FRIENDS.map((name, idx) => {
  const base = +(14 + (idx * 3.7 + 5) % 15).toFixed(2);
  const spark = generateSparkline(base, idx * 7 + 3);
  const last = spark[spark.length - 1];
  const change = +(((last - base) / base) * 100).toFixed(2);
  return {
    id: `bro-${idx}`,
    ticker: name.split(" ")[0].toUpperCase().slice(0, 4),
    name,
    basePrice: base,
    price: last,
    change,
    leverage: [10, 20, 25][idx % 3],
    sparkline: spark,
    votes: 0,
    emoji: "🧑‍🤝‍🧑",
    type: 'bro'
  };
});

export const HOES_FULL = [
  { initials: "AY", name: "AY", emoji: "💜" },
  { initials: "AC", name: "AC", emoji: "🔥" },
  { initials: "LB", name: "LB", emoji: "💅" },
  { initials: "SB", name: "SB", emoji: "✨" },
  { initials: "MO", name: "MO", emoji: "🌹" },
  { initials: "NB", name: "NB", emoji: "💎" },
  { initials: "FM", name: "FM", emoji: "🦋" }
];

export const HOES = HOES_FULL.map((h, idx) => {
  const base = +(11 + (idx * 4.1 + 3) % 14).toFixed(2);
  const spark = generateSparkline(base, idx * 13 + 11);
  const last = spark[spark.length - 1];
  const change = +(((last - base) / base) * 100).toFixed(2);
  return {
    id: `hoe-${idx}`,
    ticker: h.initials,
    name: h.name,
    basePrice: base,
    price: last,
    change,
    leverage: [25, 50][idx % 2],
    sparkline: spark,
    votes: 0,
    emoji: h.emoji,
    type: 'hoe'
  };
});
