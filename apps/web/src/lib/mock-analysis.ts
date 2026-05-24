import type { StockSageAnalysis } from "./stocksage-types";

const start = new Date("2025-10-01T00:00:00.000Z");

function isoDate(offset: number) {
  const date = new Date(start);
  date.setDate(start.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function makeChart() {
  return Array.from({ length: 132 }, (_, index) => {
    const base = 840 + index * 2.35 + Math.sin(index / 5) * 22;
    const open = base + Math.sin(index / 3) * 8;
    const close = base + Math.cos(index / 4) * 10;
    const high = Math.max(open, close) + 14 + Math.sin(index) * 2;
    const low = Math.min(open, close) - 12 - Math.cos(index) * 2;

    return {
      date: isoDate(index),
      open,
      high,
      low,
      close,
      volume: 41_000_000 + Math.sin(index / 6) * 7_000_000 + index * 31_000,
      ma20: index > 18 ? base - 8 + Math.sin(index / 7) * 6 : null,
      ma50: index > 48 ? base - 22 + Math.cos(index / 12) * 5 : null,
      rsi: 54 + Math.sin(index / 8) * 14,
    };
  });
}

const chart = makeChart();
const latest = chart[chart.length - 1];

const forecastPath = Array.from({ length: 21 }, (_, index) => {
  const price = latest.close * (1 + (index + 1) * 0.0045);
  return {
    date: isoDate(chart.length + index),
    price,
    lower: price * 0.958,
    upper: price * 1.046,
  };
});

export const mockAnalysis: StockSageAnalysis = {
  ticker: "NVDA",
  generatedAt: new Date("2026-05-24T08:45:00.000Z").toISOString(),
  quote: {
    price: latest.close,
    previousClose: latest.close * 0.984,
    change: latest.close * 0.016,
    changePct: 1.6,
  },
  signal: {
    trend: "bullish",
    confidence: 0.74,
    probability: 0.74,
    recommendation: "Strong Buy",
    tone: "positive",
  },
  metrics: {
    rsi: 61.8,
    momentum: "neutral",
    volatility: 32.4,
    volumeState: "normal",
    riskReward: 3,
    targetPrice: latest.close * 1.15,
    stopLossPrice: latest.close * 0.95,
    potentialProfit: 150,
    potentialLoss: 50,
    maTrend: "bullish",
  },
  forecast: {
    horizonDays: 21,
    label: "1 Month",
    price: forecastPath[forecastPath.length - 1].price,
    lower: forecastPath[forecastPath.length - 1].lower,
    upper: forecastPath[forecastPath.length - 1].upper,
    expectedReturnPct: 9.3,
    validationMape: 6.4,
    path: forecastPath,
  },
  chart,
  profile: {
    name: "NVIDIA Corporation",
    ticker: "NVDA",
    sector: "Technology",
    industry: "Semiconductors",
    summary:
      "NVIDIA designs accelerated computing platforms for gaming, data centers, professional visualization, automotive systems, and AI infrastructure.",
    website: "https://www.nvidia.com",
    marketCap: 3_040_000_000_000,
    marketCapLabel: "$3.04T",
    trailingPe: 48.2,
    forwardPe: 32.7,
    priceToBook: 44.8,
    profitMargin: 0.488,
    operatingMargin: 0.62,
    returnOnEquity: 1.09,
    dividendYield: 0.0003,
    beta: 1.76,
    fiftyTwoWeekHigh: 1153.2,
    fiftyTwoWeekLow: 640.8,
    averageVolume: 48_300_000,
  },
  news: [
    {
      title: "AI infrastructure demand keeps semiconductor leaders in focus",
      publisher: "Market Desk",
      url: "https://example.com/ai-infrastructure",
      imageUrl:
        "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80",
      publishedAt: "2026-05-24T06:30:00.000Z",
    },
    {
      title: "Chip stocks gain as cloud capex expectations rise",
      publisher: "Finance Wire",
      url: "https://example.com/chip-stocks",
      imageUrl:
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
      publishedAt: "2026-05-23T15:00:00.000Z",
    },
    {
      title: "Analysts revisit GPU shipment forecasts for the next quarter",
      publisher: "Equity Brief",
      url: "https://example.com/gpu-forecast",
      imageUrl:
        "https://images.unsplash.com/photo-1640340434855-6084b1f4901c?auto=format&fit=crop&w=900&q=80",
      publishedAt: "2026-05-23T10:15:00.000Z",
    },
  ],
  disclaimer: "For educational and research purposes only; not financial advice.",
};

