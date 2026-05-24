from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .analysis import DEFAULT_ARTIFACT_DIR, analyze_stock
from .market_data import MarketDataProvider, YahooFinanceProvider
from .schemas import AnalyzeRequest


def create_app(
    provider: MarketDataProvider | None = None,
    artifact_dir: Path = DEFAULT_ARTIFACT_DIR,
) -> FastAPI:
    app = FastAPI(
        title="StockSage API",
        version="1.0.0",
        description="AI-assisted stock analysis and forecasting API.",
    )
    app.state.provider = provider or YahooFinanceProvider()
    app.state.artifact_dir = artifact_dir

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/analyze")
    def analyze(request: AnalyzeRequest) -> dict:
        try:
            return analyze_stock(
                request,
                provider=app.state.provider,
                artifact_dir=app.state.artifact_dir,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail="StockSage analysis failed. Please retry or choose another ticker.",
            ) from exc

    return app


app = create_app()

