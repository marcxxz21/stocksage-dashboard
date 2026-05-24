from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_absolute_percentage_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler

from .market_data import MarketDataProvider, normalize_news
from .schemas import AnalyzeRequest


DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "model_artifacts"

HORIZON_DAYS = {
    "1w": 5,
    "1m": 21,
    "3m": 63,
    "6m": 126,
}

TIMEFRAME_LABELS = {
    "1w": "1 Week",
    "1m": "1 Month",
    "3m": "3 Months",
    "6m": "6 Months",
}


class StockSageModel(nn.Module):
    def __init__(self, n_features: int):
        super().__init__()
        self.cnn = nn.Conv1d(in_channels=n_features, out_channels=64, kernel_size=3)
        self.lstm = nn.LSTM(input_size=64, hidden_size=64, batch_first=True)
        self.fc1 = nn.Linear(64, 32)
        self.fc2 = nn.Linear(32, 1)
        self.relu = nn.ReLU()
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x.transpose(1, 2)
        x = self.relu(self.cnn(x))
        x = x.transpose(1, 2)
        out, _ = self.lstm(x)
        x = self.relu(self.fc1(out[:, -1, :]))
        return self.sigmoid(self.fc2(x))


@lru_cache(maxsize=4)
def load_assets(artifact_dir: str = str(DEFAULT_ARTIFACT_DIR)) -> tuple[nn.Module, Any, dict[str, Any]]:
    base = Path(artifact_dir)
    with (base / "metadata.json").open("r", encoding="utf-8") as handle:
        meta = json.load(handle)

    scaler = joblib.load(base / "scaler.pkl")
    model = StockSageModel(len(meta["feature_cols"]))
    model.load_state_dict(
        torch.load(base / "best_model.pth", map_location=torch.device("cpu"))
    )
    model.eval()
    return model, scaler, meta


def get_features(df: pd.DataFrame) -> pd.DataFrame:
    featured = df.copy()
    featured["Returns"] = featured["Close"].pct_change()
    featured["MA20"] = featured["Close"].rolling(20).mean()
    featured["MA50"] = featured["Close"].rolling(50).mean()

    delta = featured["Close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
    featured["RSI"] = 100 - (100 / (1 + (gain / loss)))
    featured["Vol_Rel"] = featured["Volume"] / featured["Volume"].rolling(20).mean()

    return featured.replace([np.inf, -np.inf], np.nan).dropna()


def forecast_future_price(df_feat: pd.DataFrame, timeframe: str) -> dict[str, Any]:
    horizon_days = HORIZON_DAYS[timeframe]
    feature_cols = ["Close", "Returns", "MA20", "MA50", "RSI", "Vol_Rel"]

    model_df = df_feat.copy()
    model_df["Forward_Log_Return"] = np.log(
        model_df["Close"].shift(-horizon_days) / model_df["Close"]
    )
    model_df = model_df.replace([np.inf, -np.inf], np.nan).dropna()

    if len(model_df) < max(90, horizon_days * 3):
        raise ValueError("Not enough historical data for this forecast horizon.")

    x = model_df[feature_cols]
    y = model_df["Forward_Log_Return"]
    split_idx = max(int(len(model_df) * 0.8), len(model_df) - max(30, horizon_days))

    x_train, x_valid = x.iloc[:split_idx], x.iloc[split_idx:]
    y_train, y_valid = y.iloc[:split_idx], y.iloc[split_idx:]

    regressor = Pipeline(
        [
            ("scaler", RobustScaler()),
            ("model", RidgeCV(alphas=np.logspace(-4, 4, 25))),
        ]
    )
    regressor.fit(x_train, y_train)

    valid_pred = regressor.predict(x_valid)
    valid_actual_prices = model_df["Close"].iloc[split_idx:].to_numpy() * np.exp(
        y_valid.to_numpy()
    )
    valid_pred_prices = model_df["Close"].iloc[split_idx:].to_numpy() * np.exp(valid_pred)
    mape = float(mean_absolute_percentage_error(valid_actual_prices, valid_pred_prices))
    residual_std = float(np.std(y_valid.to_numpy() - valid_pred))

    predicted_log_return = float(regressor.predict(df_feat[feature_cols].tail(1))[0])
    current_price = float(df_feat["Close"].iloc[-1])
    forecast_price = current_price * float(np.exp(predicted_log_return))

    interval_width = max(1.28 * residual_std, 0.01)
    lower_price = current_price * float(np.exp(predicted_log_return - interval_width))
    upper_price = current_price * float(np.exp(predicted_log_return + interval_width))

    forecast_dates = pd.bdate_range(df_feat.index[-1], periods=horizon_days + 1)[1:]
    forecast_path = np.geomspace(current_price, forecast_price, num=horizon_days + 1)[1:]
    lower_path = np.geomspace(current_price, lower_price, num=horizon_days + 1)[1:]
    upper_path = np.geomspace(current_price, upper_price, num=horizon_days + 1)[1:]

    return {
        "horizonDays": horizon_days,
        "label": TIMEFRAME_LABELS[timeframe],
        "price": forecast_price,
        "lower": lower_price,
        "upper": upper_price,
        "expectedReturnPct": (forecast_price / current_price - 1) * 100,
        "validationMape": mape * 100,
        "path": [
            {
                "date": date.date().isoformat(),
                "price": float(price),
                "lower": float(lower),
                "upper": float(upper),
            }
            for date, price, lower, upper in zip(
                forecast_dates, forecast_path, lower_path, upper_path, strict=True
            )
        ],
    }


def _safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None or pd.isna(value):
            return default
        number = float(value)
        if np.isfinite(number):
            return number
    except Exception:
        return default
    return default


def _safe_int(value: Any, default: int | None = None) -> int | None:
    number = _safe_float(value)
    return int(number) if number is not None else default


def _compact_market_cap(value: Any) -> str | None:
    mcap = _safe_float(value)
    if mcap is None:
        return None
    if mcap >= 1e12:
        return f"${mcap / 1e12:.2f}T"
    if mcap >= 1e9:
        return f"${mcap / 1e9:.2f}B"
    if mcap >= 1e6:
        return f"${mcap / 1e6:.2f}M"
    return f"${mcap:,.0f}"


def _build_profile(info: dict[str, Any], ticker: str) -> dict[str, Any]:
    return {
        "name": info.get("shortName") or info.get("longName") or ticker,
        "ticker": ticker,
        "sector": info.get("sector") or "Unknown",
        "industry": info.get("industry") or "Unknown",
        "summary": info.get("longBusinessSummary") or "No company overview available.",
        "website": info.get("website"),
        "marketCap": _safe_float(info.get("marketCap")),
        "marketCapLabel": _compact_market_cap(info.get("marketCap")),
        "trailingPe": _safe_float(info.get("trailingPE")),
        "forwardPe": _safe_float(info.get("forwardPE")),
        "priceToBook": _safe_float(info.get("priceToBook")),
        "profitMargin": _safe_float(info.get("profitMargins")),
        "operatingMargin": _safe_float(info.get("operatingMargins")),
        "returnOnEquity": _safe_float(info.get("returnOnEquity")),
        "dividendYield": _safe_float(info.get("dividendYield")),
        "beta": _safe_float(info.get("beta")),
        "fiftyTwoWeekHigh": _safe_float(info.get("fiftyTwoWeekHigh")),
        "fiftyTwoWeekLow": _safe_float(info.get("fiftyTwoWeekLow")),
        "averageVolume": _safe_int(info.get("averageVolume")),
    }


def analyze_stock(
    request: AnalyzeRequest,
    provider: MarketDataProvider,
    artifact_dir: Path = DEFAULT_ARTIFACT_DIR,
) -> dict[str, Any]:
    ticker = request.ticker.strip().upper()
    history = provider.history(ticker, period="5y")

    if history.empty:
        raise ValueError("Invalid ticker or no market data returned.")

    required_cols = {"Open", "High", "Low", "Close", "Volume"}
    if not required_cols.issubset(history.columns):
        raise ValueError("Market data response is missing OHLCV columns.")

    history = history.sort_index()
    df_feat = get_features(history)

    if len(df_feat) < 60:
        raise ValueError("Not enough historical data to compute indicators.")

    model, scaler, meta = load_assets(str(artifact_dir))

    last_data = df_feat[meta["feature_cols"]].tail(meta["seq_len"])
    if len(last_data) < meta["seq_len"]:
        raise ValueError("Not enough feature data to run model inference.")

    last_scaled = np.asarray(scaler.transform(last_data), dtype=np.float32).copy()
    input_tensor = torch.FloatTensor(last_scaled).unsqueeze(0)
    with torch.no_grad():
        probability = float(model(input_tensor).item())

    current_price = float(history["Close"].iloc[-1])
    previous_close = float(history["Close"].iloc[-2]) if len(history) >= 2 else current_price
    change = current_price - previous_close
    change_pct = (change / previous_close) * 100 if previous_close else 0

    forecast = forecast_future_price(df_feat, request.timeframe)

    target_price = current_price * (1 + request.target_pct / 100)
    stop_price = current_price * (1 - request.loss_pct / 100)
    potential_profit = request.capital * (request.target_pct / 100)
    potential_loss = request.capital * (request.loss_pct / 100)
    risk_reward = potential_profit / potential_loss if potential_loss > 0 else 0

    trend = "bullish" if probability > 0.5 else "bearish"
    confidence = probability if trend == "bullish" else 1 - probability
    if risk_reward >= 2 and probability > 0.6:
        recommendation = "Strong Buy"
        recommendation_tone = "positive"
    elif risk_reward >= 1.5 and probability > 0.5:
        recommendation = "Hold / Caution"
        recommendation_tone = "warning"
    else:
        recommendation = "Avoid / Sell"
        recommendation_tone = "negative"

    current_rsi = float(df_feat["RSI"].iloc[-1])
    current_ma50 = float(df_feat["MA50"].iloc[-1])
    current_volume = float(df_feat["Volume"].iloc[-1])
    avg_volume = float(df_feat["Volume"].rolling(20).mean().iloc[-1])
    volatility = float(df_feat["Returns"].tail(20).std() * np.sqrt(252) * 100)

    chart_rows = df_feat.tail(180)
    chart = [
        {
            "date": idx.date().isoformat(),
            "open": float(row.Open),
            "high": float(row.High),
            "low": float(row.Low),
            "close": float(row.Close),
            "volume": float(row.Volume),
            "ma20": _safe_float(row.MA20),
            "ma50": _safe_float(row.MA50),
            "rsi": _safe_float(row.RSI),
        }
        for idx, row in chart_rows.iterrows()
    ]

    info = provider.info(ticker)
    news = normalize_news(provider.news(ticker, limit=12))

    return {
        "ticker": ticker,
        "generatedAt": pd.Timestamp.now(tz="UTC").isoformat(),
        "quote": {
            "price": current_price,
            "previousClose": previous_close,
            "change": change,
            "changePct": change_pct,
        },
        "signal": {
            "trend": trend,
            "confidence": confidence,
            "probability": probability,
            "recommendation": recommendation,
            "tone": recommendation_tone,
        },
        "metrics": {
            "rsi": current_rsi,
            "momentum": "overbought"
            if current_rsi > 70
            else "oversold"
            if current_rsi < 30
            else "neutral",
            "volatility": volatility,
            "volumeState": "spike" if current_volume > avg_volume * 1.5 else "normal",
            "riskReward": risk_reward,
            "targetPrice": target_price,
            "stopLossPrice": stop_price,
            "potentialProfit": potential_profit,
            "potentialLoss": potential_loss,
            "maTrend": "bullish" if current_price > current_ma50 else "bearish",
        },
        "forecast": forecast,
        "chart": chart,
        "profile": _build_profile(info, ticker),
        "news": news,
        "disclaimer": "For educational and research purposes only; not financial advice.",
    }
