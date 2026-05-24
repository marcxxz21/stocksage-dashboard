import type { StockSageAnalysis, Timeframe } from "./stocksage-types";

const start = new Date("2025-10-01T00:00:00.000Z");

const tickerProfiles: Record<
  string,
  {
    name: string;
    sector: string;
    industry: string;
    summary: string;
    base: number;
    marketCapLabel: string;
    averageVolume: number;
    website: string;
  }
> = {
  NVDA: {
    name: "NVIDIA Corporation",
    sector: "Technology",
    industry: "Semiconductors",
    summary:
      "NVIDIA designs accelerated computing platforms for gaming, data centers, professional visualization, automotive systems, and AI infrastructure.",
    base: 840,
    marketCapLabel: "$3.04T",
    averageVolume: 48_300_000,
    website: "https://www.nvidia.com",
  },
  AAPL: {
    name: "Apple Inc.",
    sector: "Technology",
    industry: "Consumer Electronics",
    summary:
      "Apple designs iPhone, Mac, iPad, wearables, and services used by consumers and enterprises worldwide.",
    base: 165,
    marketCapLabel: "$3.28T",
    averageVolume: 55_200_000,
    website: "https://www.apple.com",
  },
  MSFT: {
    name: "Microsoft Corporation",
    sector: "Technology",
    industry: "Software Infrastructure",
    summary:
      "Microsoft builds cloud, productivity, AI, gaming, and enterprise software platforms.",
    base: 390,
    marketCapLabel: "$3.11T",
    averageVolume: 22_800_000,
    website: "https://www.microsoft.com",
  },
  TSLA: {
    name: "Tesla, Inc.",
    sector: "Consumer Cyclical",
    industry: "Auto Manufacturers",
    summary:
      "Tesla designs electric vehicles, energy storage, solar products, autonomous driving software, and robotics initiatives.",
    base: 215,
    marketCapLabel: "$735.00B",
    averageVolume: 89_000_000,
    website: "https://www.tesla.com",
  },
  SPY: {
    name: "SPDR S&P 500 ETF Trust",
    sector: "ETF",
    industry: "Large Cap Blend",
    summary:
      "SPY tracks the S&P 500 Index and is commonly used as a broad proxy for large-cap US equities.",
    base: 510,
    marketCapLabel: "$615.00B",
    averageVolume: 67_000_000,
    website: "https://www.ssga.com",
  },
  QQQ: {
    name: "Invesco QQQ Trust",
    sector: "ETF",
    industry: "Large Cap Growth",
    summary:
      "QQQ tracks the Nasdaq-100 Index, with heavy exposure to technology and growth-oriented companies.",
    base: 440,
    marketCapLabel: "$275.00B",
    averageVolume: 42_000_000,
    website: "https://www.invesco.com",
  },
};

const horizonDays: Record<Timeframe, number> = {
  "1w": 5,
  "1m": 21,
  "3m": 63,
  "6m": 126,
};

const horizonLabels: Record<Timeframe, string> = {
  "1w": "1 Week",
  "1m": "1 Month",
  "3m": "3 Months",
  "6m": "6 Months",
};

function isoDate(offset: number) {
  const date = new Date(start);
  date.setDate(start.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function hashTicker(ticker: string) {
  return ticker.split("").reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
}

function fallbackProfile(ticker: string) {
  const hash = hashTicker(ticker);
  return {
    name: `${ticker} Holdings`,
    sector: "Market Data",
    industry: "Public Equity",
    summary:
      "Temporary local preview data. Run live analysis to fetch fresh Yahoo Finance data for this ticker.",
    base: 70 + (hash % 220),
    marketCapLabel: `$${(20 + (hash % 900)).toFixed(0)}B`,
    averageVolume: 8_000_000 + hash * 14_000,
    website: `https://finance.yahoo.com/quote/${ticker}`,
  };
}

function makeChart(ticker: string, base: number) {
  const hash = hashTicker(ticker);
  const slope = 0.08 + (hash % 17) / 100;
  const amplitude = Math.max(2, base * (0.025 + (hash % 5) / 400));

  return Array.from({ length: 132 }, (_, index) => {
    const directional = base + index * slope + Math.sin((index + hash) / 5) * amplitude;
    const open = directional + Math.sin((index + hash) / 3) * (amplitude * 0.35);
    const close = directional + Math.cos((index + hash) / 4) * (amplitude * 0.45);
    const high = Math.max(open, close) + amplitude * 0.7;
    const low = Math.min(open, close) - amplitude * 0.65;

    return {
      date: isoDate(index),
      open,
      high,
      low,
      close,
      volume: 1_000_000 + hash * 75_000 + Math.sin(index / 6) * hash * 700 + index * 31_000,
      ma20: index > 18 ? directional - amplitude * 0.18 + Math.sin(index / 7) * (amplitude * 0.2) : null,
      ma50: index > 48 ? directional - amplitude * 0.42 + Math.cos(index / 12) * (amplitude * 0.18) : null,
      rsi: 48 + Math.sin((index + hash) / 8) * 16,
    };
  });
}

export function createMockAnalysis(tickerInput: string, timeframe: Timeframe = "1m"): StockSageAnalysis {
  const ticker = tickerInput.trim().toUpperCase() || "NVDA";
  const profile = tickerProfiles[ticker] || fallbackProfile(ticker);
  const chart = makeChart(ticker, profile.base);
  const latest = chart[chart.length - 1];
  const previousClose = chart[chart.length - 2].close;
  const change = latest.close - previousClose;
  const changePct = (change / previousClose) * 100;
  const days = horizonDays[timeframe];
  const expectedReturnPct = Math.max(-8, Math.min(12, changePct * Math.sqrt(days)));
  const forecastPrice = latest.close * (1 + expectedReturnPct / 100);
  const forecastPath = Array.from({ length: days }, (_, index) => {
    const step = (index + 1) / days;
    const price = latest.close + (forecastPrice - latest.close) * step;
    const interval = (0.025 + days / 5000) * step;
    return {
      date: isoDate(chart.length + index),
      price,
      lower: price * (1 - interval),
      upper: price * (1 + interval),
    };
  });
  const latestRsi = latest.rsi || 50;
  const probability = Math.min(0.86, Math.max(0.14, 0.55 + changePct / 20 + (latest.close > (latest.ma50 || latest.close) ? 0.08 : -0.06)));
  const trend = probability >= 0.5 ? "bullish" : "bearish";
  const recommendation = probability > 0.58 ? "Strong Buy" : probability > 0.49 ? "Hold / Caution" : "Avoid / Sell";
  const lastForecast = forecastPath[forecastPath.length - 1];

  return {
    ticker,
    generatedAt: new Date().toISOString(),
    quote: {
      price: latest.close,
      previousClose,
      change,
      changePct,
    },
    signal: {
      trend,
      confidence: trend === "bullish" ? probability : 1 - probability,
      probability,
      recommendation,
      tone: recommendation === "Strong Buy" ? "positive" : recommendation === "Hold / Caution" ? "warning" : "negative",
    },
    metrics: {
      rsi: latestRsi,
      momentum: latestRsi > 70 ? "overbought" : latestRsi < 30 ? "oversold" : "neutral",
      volatility: 24 + (hashTicker(ticker) % 18),
      volumeState: "normal",
      riskReward: 3,
      targetPrice: latest.close * 1.15,
      stopLossPrice: latest.close * 0.95,
      potentialProfit: 150,
      potentialLoss: 50,
      maTrend: latest.close > (latest.ma50 || latest.close) ? "bullish" : "bearish",
    },
    forecast: {
      horizonDays: days,
      label: horizonLabels[timeframe],
      price: forecastPrice,
      lower: lastForecast.lower,
      upper: lastForecast.upper,
      expectedReturnPct,
      validationMape: 7.2,
      path: forecastPath,
    },
    chart,
    profile: {
      name: profile.name,
      ticker,
      sector: profile.sector,
      industry: profile.industry,
      summary: profile.summary,
      website: profile.website,
      marketCap: null,
      marketCapLabel: profile.marketCapLabel,
      trailingPe: null,
      forwardPe: null,
      priceToBook: null,
      profitMargin: null,
      operatingMargin: null,
      returnOnEquity: null,
      dividendYield: null,
      beta: null,
      fiftyTwoWeekHigh: Math.max(...chart.map((point) => point.high)),
      fiftyTwoWeekLow: Math.min(...chart.map((point) => point.low)),
      averageVolume: profile.averageVolume,
    },
    news: [
      {
        title: `${ticker} preview data is ready while live analysis loads`,
        publisher: "StockSage Preview",
        url: `https://finance.yahoo.com/quote/${ticker}`,
        imageUrl: null,
        publishedAt: new Date().toISOString(),
      },
    ],
    disclaimer: "Preview data is generated locally; live data is fetched through the StockSage API route.",
  };
}

export const mockAnalysis = createMockAnalysis("NVDA");
