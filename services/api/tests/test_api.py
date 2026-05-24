from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import pytest
import torch
from fastapi.testclient import TestClient

from app import analysis
from app.main import create_app


class IdentityScaler:
    def transform(self, data):
        return np.asarray(data, dtype=float)


class StaticModel:
    def __init__(self, value: float = 0.68):
        self.value = value

    def __call__(self, _tensor):
        return torch.tensor([[self.value]], dtype=torch.float32)


@dataclass
class FakeProvider:
    frame: pd.DataFrame
    profile: dict
    news_items: list[dict]

    def history(self, ticker: str, period: str = "5y") -> pd.DataFrame:
        return self.frame

    def info(self, ticker: str) -> dict:
        return self.profile

    def news(self, ticker: str, limit: int = 12) -> list[dict]:
        return self.news_items[:limit]


def make_history(days: int = 620) -> pd.DataFrame:
    index = pd.bdate_range("2024-01-01", periods=days)
    trend = np.linspace(100, 155, days)
    wave = np.sin(np.linspace(0, 18, days)) * 2
    close = trend + wave
    open_ = close - 0.7
    high = close + 1.8
    low = close - 2.0
    volume = np.linspace(1_000_000, 1_350_000, days)
    return pd.DataFrame(
        {
            "Open": open_,
            "High": high,
            "Low": low,
            "Close": close,
            "Volume": volume,
        },
        index=index,
    )


@pytest.fixture
def fake_provider() -> FakeProvider:
    return FakeProvider(
        frame=make_history(),
        profile={
            "shortName": "NVIDIA Corporation",
            "sector": "Technology",
            "marketCap": 3_000_000_000_000,
            "trailingPE": 48.2,
        },
        news_items=[
            {
                "content": {
                    "title": "NVIDIA posts fresh data center growth",
                    "provider": {"displayName": "Market Desk"},
                    "clickThroughUrl": {"url": "https://example.com/nvda"},
                }
            }
        ],
    )


@pytest.fixture(autouse=True)
def fake_assets(monkeypatch):
    monkeypatch.setattr(
        analysis,
        "load_assets",
        lambda _artifact_dir: (
            StaticModel(),
            IdentityScaler(),
            {
                "feature_cols": ["Close", "Returns", "MA20", "MA50", "RSI", "Vol_Rel"],
                "seq_len": 30,
            },
        ),
    )


def test_health(fake_provider):
    client = TestClient(create_app(provider=fake_provider))
    assert client.get("/health").json() == {"status": "ok"}


def test_analyze_valid_ticker(fake_provider):
    client = TestClient(create_app(provider=fake_provider))

    response = client.post(
        "/analyze",
        json={
            "ticker": "nvda",
            "capital": 1000,
            "targetPct": 15,
            "lossPct": 5,
            "timeframe": "1m",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ticker"] == "NVDA"
    assert payload["signal"]["trend"] == "bullish"
    assert payload["signal"]["recommendation"] == "Strong Buy"
    assert payload["forecast"]["horizonDays"] == 21
    assert len(payload["chart"]) > 100
    assert payload["news"][0]["publisher"] == "Market Desk"


@pytest.mark.parametrize(
    ("timeframe", "days"),
    [("1w", 5), ("1m", 21), ("3m", 63), ("6m", 126)],
)
def test_forecast_horizons(fake_provider, timeframe, days):
    client = TestClient(create_app(provider=fake_provider))
    response = client.post(
        "/analyze",
        json={
            "ticker": "AAPL",
            "capital": 2500,
            "targetPct": 12,
            "lossPct": 4,
            "timeframe": timeframe,
        },
    )

    assert response.status_code == 200
    assert response.json()["forecast"]["horizonDays"] == days


def test_invalid_ticker_returns_400(fake_provider):
    fake_provider.frame = pd.DataFrame()
    client = TestClient(create_app(provider=fake_provider))

    response = client.post(
        "/analyze",
        json={
            "ticker": "NOPE",
            "capital": 1000,
            "targetPct": 15,
            "lossPct": 5,
            "timeframe": "1m",
        },
    )

    assert response.status_code == 400
    assert "Invalid ticker" in response.json()["detail"]


def test_insufficient_history_returns_400(fake_provider):
    fake_provider.frame = make_history(45)
    client = TestClient(create_app(provider=fake_provider))

    response = client.post(
        "/analyze",
        json={
            "ticker": "IPO",
            "capital": 1000,
            "targetPct": 15,
            "lossPct": 5,
            "timeframe": "1m",
        },
    )

    assert response.status_code == 400
    assert "Not enough historical data" in response.json()["detail"]


def test_model_load_failure_returns_500(fake_provider, monkeypatch):
    def broken_loader(_artifact_dir):
        raise RuntimeError("missing weights")

    monkeypatch.setattr(analysis, "load_assets", broken_loader)
    client = TestClient(create_app(provider=fake_provider))

    response = client.post(
        "/analyze",
        json={
            "ticker": "NVDA",
            "capital": 1000,
            "targetPct": 15,
            "lossPct": 5,
            "timeframe": "1m",
        },
    )

    assert response.status_code == 500
    assert "analysis failed" in response.json()["detail"].lower()
