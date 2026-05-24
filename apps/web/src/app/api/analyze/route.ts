import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIMEFRAMES = new Set(["1w", "1m", "3m", "6m"]);

export async function POST(request: NextRequest) {
  const apiUrl = process.env.STOCKSAGE_API_URL?.replace(/\/$/, "");

  if (!apiUrl) {
    return NextResponse.json(
      {
        error:
          "STOCKSAGE_API_URL is not configured. Start the FastAPI service or set the deployed API URL.",
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

  const upstream = await fetch(`${apiUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

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

