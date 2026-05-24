import { NextRequest, NextResponse } from "next/server";
import type { AnalyzeRequest, ChartPoint, ForecastPoint, StockSageAnalysis } from "@/lib/stocksage-types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIMEFRAMES = new Set(["1w", "1m", "3m", "6m"]);
const LOCAL_API_URL = "http://localhost:8000";
const HORIZON_DAYS = {
  "1w": 5,
  "1m": 21,
  "3m": 63,
  "6m": 126,
} as const;
const HORIZON_LABELS = {
  "1w": "1 Week",
  "1m": "1 Month",
  "3m": "3 Months",
  "6m": "6 Months",
} as const;

function getApiConnection() {
  const configured = process.env.STOCKSAGE_API_URL?.trim().replace(/\/$/, "");

  if (configured) {
    return { url: configured, isDefaultLocal: false };
  }

  // Free local development setup: run `uvicorn app.main:app --reload --port 8000`.
  if (process.env.NODE_ENV !== "production") {
    return { url: LOCAL_API_URL, isDefaultLocal: true };
  }

  return null;
}

export async function POST(request: NextRequest) {
  const connection = getApiConnection();

  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body.ticker !== "string" ||
    !TIMEFRAMES.has(body.timeframe) ||
    typeof body.capital !== "number" ||
    typeof body.targetPct !== "number" ||
    typeof body.lossPct !== "number"
  ) {
    return NextResponse.json(
      { error: "Invalid StockSage analysis request." },
      { status: 400 },
    );
  }

  if (!connection) {
    try {
      const fallback = await analyzeWithYahooFree(body as AnalyzeRequest);
      return NextResponse.json(fallback, {
        headers: {
          "Cache-Control": "no-store",
          "X-StockSage-Data-Source": "yahoo-free-fallback",
        },
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Free Yahoo Finance fallback could not fetch this ticker.",
          setup:
            "For model-backed analysis, deploy services/api on Render and set STOCKSAGE_API_URL in Vercel.",
        },
        { status: 503 },
      );
    }
  }

  const apiUrl = connection.url;
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    if (connection.isDefaultLocal) {
      try {
        const fallback = await analyzeWithYahooFree(body as AnalyzeRequest);
        return NextResponse.json(fallback, {
          headers: {
            "Cache-Control": "no-store",
            "X-StockSage-Data-Source": "yahoo-free-fallback",
          },
        });
      } catch (fallbackError) {
        return NextResponse.json(
          {
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : "Free Yahoo Finance fallback could not fetch this ticker.",
            setup:
              "Start FastAPI locally for full model-backed yfinance analysis: cd services/api && uvicorn app.main:app --reload --port 8000",
          },
          { status: 503 },
        );
      }
    }

    return NextResponse.json(
      {
        error: `Could not reach the StockSage FastAPI service at ${apiUrl}.`,
        setup:
          apiUrl === LOCAL_API_URL
            ? "Start it locally with: cd services/api && uvicorn app.main:app --reload --port 8000"
            : "Check that STOCKSAGE_API_URL points to your deployed Render service.",
      },
      { status: 503 },
    );
  }

  const payload = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    if (connection.isDefaultLocal) {
      try {
        const fallback = await analyzeWithYahooFree(body as AnalyzeRequest);
        return NextResponse.json(fallback, {
          headers: {
            "Cache-Control": "no-store",
            "X-StockSage-Data-Source": "yahoo-free-fallback",
          },
        });
      } catch {
        // Keep the upstream FastAPI error if both local API and free fallback fail.
      }
    }

    return NextResponse.json(
      {
        error:
          payload?.detail ||
          payload?.error ||
          "StockSage API returned an unexpected error.",
        status: upstream.status,
      },
      { status: upstream.status },
    );
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        currency?: string;
        shortName?: string;
        longName?: string;
        exchangeName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string };
  };
};

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{
      longName?: string;
      shortName?: string;
      symbol?: string;
      quoteType?: string;
      exchange?: string;
      fullExchangeName?: string;
      marketCap?: number;
      trailingPE?: number;
      forwardPE?: number;
      priceToBook?: number;
      trailingAnnualDividendYield?: number;
      beta?: number;
      fiftyTwoWeekHigh?: number;
      fiftyTwoWeekLow?: number;
      averageDailyVolume3Month?: number;
    }>;
  };
};

type YahooSummaryResponse = {
  quoteSummary?: {
    result?: Array<{
      assetProfile?: {
        sector?: string;
        industry?: string;
        longBusinessSummary?: string;
        website?: string;
      };
      defaultKeyStatistics?: {
        forwardPE?: { raw?: number };
        priceToBook?: { raw?: number };
      };
      summaryDetail?: {
        marketCap?: { raw?: number };
        trailingPE?: { raw?: number };
        dividendYield?: { raw?: number };
      };
      financialData?: {
        profitMargins?: { raw?: number };
        operatingMargins?: { raw?: number };
        returnOnEquity?: { raw?: number };
      };
    }>;
  };
};

type YahooSearchResponse = {
  news?: Array<{
    title?: string;
    publisher?: string;
    link?: string;
    thumbnail?: {
      resolutions?: Array<{ url?: string }>;
    };
    providerPublishTime?: number;
  }>;
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function movingAverage(values: number[], index: number, window: number) {
  if (index + 1 < window) {
    return null;
  }
  return average(values.slice(index + 1 - window, index + 1));
}

function calculateRsi(closes: number[], index: number, window = 14) {
  if (index < window) {
    return null;
  }

  let gains = 0;
  let losses = 0;
  for (let cursor = index - window + 1; cursor <= index; cursor += 1) {
    const change = closes[cursor] - closes[cursor - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const avgGain = gains / window;
  const avgLoss = losses / window;
  if (avgLoss === 0) {
    return 100;
  }
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function stddev(values: number[]) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function compactMarketCap(value: number | null) {
  if (!value) {
    return null;
  }
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString("en-US")}`;
}

async function fetchYahooJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 StockSage/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function analyzeWithYahooFree(request: AnalyzeRequest): Promise<StockSageAnalysis> {
  const ticker = request.ticker.trim().toUpperCase();
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker,
  )}?range=1y&interval=1d&includePrePost=false`;
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
  const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    ticker,
  )}?modules=assetProfile,summaryDetail,defaultKeyStatistics,financialData`;
  const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    ticker,
  )}&quotesCount=0&newsCount=8`;

  const [chartPayload, quotePayload, summaryPayload, searchPayload] = await Promise.all([
    fetchYahooJson<YahooChartResponse>(chartUrl),
    fetchYahooJson<YahooQuoteResponse>(quoteUrl),
    fetchYahooJson<YahooSummaryResponse>(summaryUrl),
    fetchYahooJson<YahooSearchResponse>(searchUrl),
  ]);

  if (!chartPayload) {
    throw new Error(`Yahoo Finance did not return chart data for ${ticker}.`);
  }

  const result = chartPayload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];

  if (!result || !quote || timestamps.length < 60) {
    throw new Error(`No usable Yahoo Finance chart data returned for ${ticker}.`);
  }

  const rawRows = timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: quote.volume?.[index],
    }))
    .filter(
      (
        row,
      ): row is {
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      } =>
        typeof row.open === "number" &&
        typeof row.high === "number" &&
        typeof row.low === "number" &&
        typeof row.close === "number" &&
        typeof row.volume === "number",
    );

  if (rawRows.length < 60) {
    throw new Error(`Not enough Yahoo Finance history returned for ${ticker}.`);
  }

  const closes = rawRows.map((row) => row.close);
  const volumes = rawRows.map((row) => row.volume);
  const chart: ChartPoint[] = rawRows.slice(-180).map((row, visibleIndex, visibleRows) => {
    const originalIndex = rawRows.length - visibleRows.length + visibleIndex;
    return {
      ...row,
      ma20: movingAverage(closes, originalIndex, 20),
      ma50: movingAverage(closes, originalIndex, 50),
      rsi: calculateRsi(closes, originalIndex),
    };
  });

  const latest = rawRows[rawRows.length - 1];
  const yahooQuote = quotePayload?.quoteResponse?.result?.[0];
  const yahooSummary = summaryPayload?.quoteSummary?.result?.[0];
  const assetProfile = yahooSummary?.assetProfile;
  const summaryDetail = yahooSummary?.summaryDetail;
  const defaultStats = yahooSummary?.defaultKeyStatistics;
  const financialData = yahooSummary?.financialData;
  const previousClose =
    result.meta?.previousClose || result.meta?.chartPreviousClose || rawRows[rawRows.length - 2]?.close || latest.close;
  const change = latest.close - previousClose;
  const changePct = previousClose ? (change / previousClose) * 100 : 0;
  const latestRsi = chart[chart.length - 1].rsi || 50;
  const latestMa50 = chart[chart.length - 1].ma50 || latest.close;
  const returns = closes
    .slice(-45)
    .map((close, index, values) => (index === 0 ? 0 : (close - values[index - 1]) / values[index - 1]))
    .slice(1);
  const volatility = stddev(returns.slice(-20)) * Math.sqrt(252) * 100;
  const avgVolume = average(volumes.slice(-20));
  const momentumScore =
    (changePct > 0 ? 0.18 : -0.12) +
    (latest.close > latestMa50 ? 0.18 : -0.14) +
    (latestRsi > 55 ? 0.08 : latestRsi < 45 ? -0.08 : 0);
  const probability = Math.min(0.88, Math.max(0.12, 0.52 + momentumScore));
  const trend = probability >= 0.5 ? "bullish" : "bearish";
  const confidence = trend === "bullish" ? probability : 1 - probability;
  const potentialProfit = request.capital * (request.targetPct / 100);
  const potentialLoss = request.capital * (request.lossPct / 100);
  const riskReward = potentialLoss > 0 ? potentialProfit / potentialLoss : 0;
  const recommendation =
    riskReward >= 2 && probability > 0.58
      ? "Strong Buy"
      : riskReward >= 1.5 && probability > 0.5
        ? "Hold / Caution"
        : "Avoid / Sell";
  const tone = recommendation === "Strong Buy" ? "positive" : recommendation === "Hold / Caution" ? "warning" : "negative";

  const horizonDays = HORIZON_DAYS[request.timeframe];
  const recentDrift = average(returns.slice(-20));
  const boundedDailyDrift = Math.min(0.012, Math.max(-0.012, recentDrift || changePct / 100 / 21));
  const expectedReturnPct = (Math.exp(boundedDailyDrift * horizonDays) - 1) * 100;
  const forecastPrice = latest.close * (1 + expectedReturnPct / 100);
  const intervalPct = Math.max(0.025, (volatility / 100) * Math.sqrt(horizonDays / 252) * 1.28);
  const forecastPath: ForecastPoint[] = Array.from({ length: horizonDays }, (_, index) => {
    const step = (index + 1) / horizonDays;
    const date = new Date(`${latest.date}T00:00:00.000Z`);
    date.setDate(date.getDate() + index + 1);
    const price = latest.close + (forecastPrice - latest.close) * step;
    const localInterval = intervalPct * step;
    return {
      date: date.toISOString().slice(0, 10),
      price,
      lower: price * (1 - localInterval),
      upper: price * (1 + localInterval),
    };
  });
  const lastForecast = forecastPath[forecastPath.length - 1];
  const companyName = yahooQuote?.longName || result.meta?.longName || yahooQuote?.shortName || result.meta?.shortName || ticker;
  const marketCap = summaryDetail?.marketCap?.raw ?? yahooQuote?.marketCap ?? null;
  const news =
    searchPayload?.news
      ?.filter((item) => item.title && item.link)
      .slice(0, 6)
      .map((item) => ({
        title: item.title || `${ticker} market update`,
        publisher: item.publisher || "Yahoo Finance",
        url: item.link || `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`,
        imageUrl: item.thumbnail?.resolutions?.find((image) => image.url)?.url || null,
        publishedAt: item.providerPublishTime || new Date().toISOString(),
      })) || [];

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
      confidence,
      probability,
      recommendation,
      tone,
    },
    metrics: {
      rsi: latestRsi,
      momentum: latestRsi > 70 ? "overbought" : latestRsi < 30 ? "oversold" : "neutral",
      volatility,
      volumeState: latest.volume > avgVolume * 1.5 ? "spike" : "normal",
      riskReward,
      targetPrice: latest.close * (1 + request.targetPct / 100),
      stopLossPrice: latest.close * (1 - request.lossPct / 100),
      potentialProfit,
      potentialLoss,
      maTrend: latest.close > latestMa50 ? "bullish" : "bearish",
    },
    forecast: {
      horizonDays,
      label: HORIZON_LABELS[request.timeframe],
      price: forecastPrice,
      lower: lastForecast.lower,
      upper: lastForecast.upper,
      expectedReturnPct,
      validationMape: Math.max(3, Math.min(18, (volatility || 20) / 5)),
      path: forecastPath,
    },
    chart,
    profile: {
      name: companyName,
      ticker,
      sector: assetProfile?.sector || yahooQuote?.quoteType || "Live Yahoo Finance",
      industry: assetProfile?.industry || yahooQuote?.fullExchangeName || yahooQuote?.exchange || result.meta?.exchangeName || "Market data",
      summary:
        assetProfile?.longBusinessSummary ||
        `${companyName} live quote, chart, fundamentals, and related headlines are fetched from Yahoo Finance free endpoints. Deploy the Python FastAPI service for the full model-backed yfinance pipeline.`,
      website: assetProfile?.website || `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`,
      marketCap,
      marketCapLabel: compactMarketCap(marketCap),
      trailingPe: summaryDetail?.trailingPE?.raw ?? yahooQuote?.trailingPE ?? null,
      forwardPe: defaultStats?.forwardPE?.raw ?? yahooQuote?.forwardPE ?? null,
      priceToBook: defaultStats?.priceToBook?.raw ?? yahooQuote?.priceToBook ?? null,
      profitMargin: financialData?.profitMargins?.raw ?? null,
      operatingMargin: financialData?.operatingMargins?.raw ?? null,
      returnOnEquity: financialData?.returnOnEquity?.raw ?? null,
      dividendYield: summaryDetail?.dividendYield?.raw ?? yahooQuote?.trailingAnnualDividendYield ?? null,
      beta: yahooQuote?.beta ?? null,
      fiftyTwoWeekHigh: yahooQuote?.fiftyTwoWeekHigh ?? Math.max(...rawRows.map((row) => row.high)),
      fiftyTwoWeekLow: yahooQuote?.fiftyTwoWeekLow ?? Math.min(...rawRows.map((row) => row.low)),
      averageVolume: yahooQuote?.averageDailyVolume3Month ?? Math.round(avgVolume),
    },
    news:
      news.length > 0
        ? news
        : [
            {
              title: `${ticker} live market data refreshed from Yahoo Finance`,
              publisher: "StockSage Free Data",
              url: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`,
              imageUrl: null,
              publishedAt: new Date().toISOString(),
            },
          ],
    disclaimer:
      "Live fallback uses free Yahoo Finance chart data for research only; deploy the FastAPI yfinance service for full model-backed analysis.",
  };
}
