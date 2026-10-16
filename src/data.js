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

// Generar historial plano para los mercados al inicio (sin randoms)
function generateFlatMarketHistory(options, days = 7) {
  const history = [];
  const total = options.reduce((sum, opt) => sum + opt.shares, 0);

  for (let i = days; i >= 0; i--) {
    const point = {
      label: i === 0 ? 'Hoy' : `Hace ${i}d`,
      data: {}
    };
    options.forEach(opt => {
      point.data[opt.name] = total === 0 ? 0 : Math.round((opt.shares / total) * 100);
    });
    history.push(point);
  }
  return history;
}

const INITIAL_SHARES = 10; // Todos parten con la misma probabilidad

export const INITIAL_MARKETS = [
  {
    id: 1,
    title: "¿Quién come más en los 5 años?",
    category: "Tendencia",
    emoji: "👑",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: INITIAL_SHARES }))
  },
  {
    id: 2,
    title: "¿Quién queda más borrado en los 5 años?",
    category: "Fiesta",
    emoji: "🥴",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: INITIAL_SHARES }))
  },
  {
    id: 3,
    title: "¿El más borrado en el cumple de Gaspar?",
    category: "Cumple Gaspar",
    emoji: "🎂",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: INITIAL_SHARES }))
  },
  {
    id: 4,
    title: "¿Gaspar se va de guaja en su cumple?",
    category: "Cumple Gaspar",
    emoji: "🤮",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: [
      { name: "Sí, de guaja", shares: INITIAL_SHARES },
      { name: "Sobrevive", shares: INITIAL_SHARES }
    ]
  },
  {
    id: 5,
    title: "¿Quién se come a AC?",
    category: "Salseo",
    emoji: "🔥",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: INITIAL_SHARES }))
  },
  {
    id: 6,
    title: "¿Quién se come una mina pololeando?",
    category: "Salseo",
    emoji: "💀",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: INITIAL_SHARES }))
  },
  {
    id: 7,
    title: "¿Quién baja el pozo?",
    category: "Fiesta",
    emoji: "🍺",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.map(f => ({ name: f, shares: INITIAL_SHARES }))
  },
  {
    id: 8,
    title: "¿Quién le roba la mina a Mati?",
    category: "Salseo",
    emoji: "😈",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: FRIENDS.filter(f => f !== "Mati").map(f => ({ name: f, shares: INITIAL_SHARES }))
  },
  {
    id: 9,
    title: "¿Peshe se come a Chiang?",
    category: "Salseo",
    emoji: "👀",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: [
      { name: "Sí", shares: INITIAL_SHARES },
      { name: "No", shares: INITIAL_SHARES }
    ]
  },
  {
    id: 10,
    title: "¿Antonio López sigue hablando con la E?",
    category: "Salseo",
    emoji: "📱",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: [
      { name: "Sí", shares: INITIAL_SHARES },
      { name: "No", shares: INITIAL_SHARES }
    ]
  },
  {
    id: 11,
    title: "¿Pala y Mati pescarán a los amigos o se irán con las alternas?",
    category: "Random",
    emoji: "🤔",
    volume: "$0.0 Vol.",
    endDate: "17 de Octubre",
    options: [
      { name: "Pescan a los amigos", shares: INITIAL_SHARES },
      { name: "Se van con las alternas", shares: INITIAL_SHARES }
    ]
  }
].map(market => ({
  ...market,
  history: generateFlatMarketHistory(market.options)
}));

// ── Acciones ──────────────────────────────────────────────
const INITIAL_STOCK_PRICE = 10;
const FLAT_SPARKLINE = new Array(14).fill(INITIAL_STOCK_PRICE); // Gráfico inicial plano en $10

export const BROS = FRIENDS.map((name, idx) => {
  return {
    id: `bro-${idx}`,
    ticker: name.split(" ")[0].toUpperCase().slice(0, 4),
    name,
    price: INITIAL_STOCK_PRICE,
    basePrice: INITIAL_STOCK_PRICE,
    change: 0,
    leverage: [10, 20, 50][idx % 3], // Mantenemos el leverage variado por si lo usas en UI
    sparkline: [...FLAT_SPARKLINE],
    votes: 0, // Reseteado
    emoji: "🧑‍🤝‍🧑"
  };
});

export const HOES_FULL = [
  { initials: "AY", emoji: "💜" },
  { initials: "AC", emoji: "🔥" },
  { initials: "LB", emoji: "💅" },
  { initials: "SB", emoji: "✨" },
  { initials: "MO", emoji: "🌹" },
  { initials: "NB", emoji: "💎" },
  { initials: "FM", emoji: "🦋" },
  // Nuevas agregadas:
  { initials: "SA", emoji: "🌸" },
  { initials: "PG", emoji: "🍒" },
  { initials: "JP", emoji: "🎀" },
  { initials: "JE", emoji: "🌟" },
  { initials: "CC", emoji: "🥂" }
];



export const HOES = HOES_FULL.map((h, idx) => {
  return {
    id: `hoe-${idx}`,
    ticker: h.initials,
    name: h.initials,
    price: INITIAL_STOCK_PRICE,
    basePrice: INITIAL_STOCK_PRICE,
    change: 0,
    leverage: [20, 50][idx % 2],
    sparkline: [...FLAT_SPARKLINE],
    votes: 0, // Reseteado
    emoji: h.emoji
  };
});