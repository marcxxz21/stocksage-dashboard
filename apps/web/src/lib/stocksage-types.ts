export type Timeframe = "1w" | "1m" | "3m" | "6m";

export type AnalyzeRequest = {
  ticker: string;
  capital: number;
  targetPct: number;
  lossPct: number;
  timeframe: Timeframe;
};

export type Tone = "positive" | "warning" | "negative";

export type ChartPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma20: number | null;
  ma50: number | null;
  rsi: number | null;
};

export type ForecastPoint = {
  date: string;
  price: number;
  lower: number;
  upper: number;
};

export type StockSageAnalysis = {
  ticker: string;
  generatedAt: string;
  quote: {
    price: number;
    previousClose: number;
    change: number;
    changePct: number;
  };
  signal: {
    trend: "bullish" | "bearish";
    confidence: number;
    probability: number;
    recommendation: string;
    tone: Tone;
  };
  metrics: {
    rsi: number;
    momentum: "overbought" | "oversold" | "neutral";
    volatility: number;
    volumeState: "spike" | "normal";
    riskReward: number;
    targetPrice: number;
    stopLossPrice: number;
    potentialProfit: number;
    potentialLoss: number;
    maTrend: "bullish" | "bearish";
  };
  forecast: {
    horizonDays: number;
    label: string;
    price: number;
    lower: number;
    upper: number;
    expectedReturnPct: number;
    validationMape: number;
    path: ForecastPoint[];
  };
  chart: ChartPoint[];
  profile: {
    name: string;
    ticker: string;
    sector: string;
    industry: string;
    summary: string;
    website?: string | null;
    marketCap: number | null;
    marketCapLabel: string | null;
    trailingPe: number | null;
    forwardPe: number | null;
    priceToBook: number | null;
    profitMargin: number | null;
    operatingMargin: number | null;
    returnOnEquity: number | null;
    dividendYield: number | null;
    beta: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    averageVolume: number | null;
  };
  news: Array<{
    title: string;
    publisher: string;
    url: string;
    imageUrl?: string | null;
    publishedAt?: string | number | null;
  }>;
  disclaimer: string;
};

export type ApiError = {
  error: string;
  status?: number;
};

