import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIMEFRAMES = new Set(["1w", "1m", "3m", "6m"]);
const LOCAL_API_URL = "http://localhost:8000";

function getApiUrl() {
  const configured = process.env.STOCKSAGE_API_URL?.trim().replace(/\/$/, "");

  if (configured) {
    return configured;
  }

  // Free local development setup: run `uvicorn app.main:app --reload --port 8000`.
  if (process.env.NODE_ENV !== "production") {
    return LOCAL_API_URL;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const apiUrl = getApiUrl();

  if (!apiUrl) {
    return NextResponse.json(
      {
        error:
          "Live analysis needs a FastAPI URL. Deploy the free API service on Render, then set STOCKSAGE_API_URL in Vercel.",
        setup:
          "For local development, start the API on http://localhost:8000 or set STOCKSAGE_API_URL explicitly.",
      },
      { status: 503 },
    );
  }

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

  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
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
