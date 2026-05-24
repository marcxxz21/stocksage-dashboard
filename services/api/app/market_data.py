from __future__ import annotations

from typing import Any, Protocol

import pandas as pd
import yfinance as yf


class MarketDataProvider(Protocol):
    def history(self, ticker: str, period: str = "5y") -> pd.DataFrame:
        ...

    def info(self, ticker: str) -> dict[str, Any]:
        ...

    def news(self, ticker: str, limit: int = 12) -> list[dict[str, Any]]:
        ...


class YahooFinanceProvider:
    def history(self, ticker: str, period: str = "5y") -> pd.DataFrame:
        return yf.Ticker(ticker).history(period=period)

    def info(self, ticker: str) -> dict[str, Any]:
        try:
            return dict(yf.Ticker(ticker).info or {})
        except Exception:
            return {}

    def news(self, ticker: str, limit: int = 12) -> list[dict[str, Any]]:
        try:
            return list(yf.Ticker(ticker).news or [])[:limit]
        except Exception:
            return []


def normalize_news(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []

    for item in items:
        content = item.get("content", item)
        click_data = content.get("clickThroughUrl")
        link = content.get("link") or "#"
        if isinstance(click_data, dict):
            link = click_data.get("url") or link

        provider = content.get("provider")
        publisher = content.get("publisher") or "Unknown"
        if isinstance(provider, dict):
            publisher = provider.get("displayName") or publisher

        image_url = None
        thumbnail = content.get("thumbnail")
        if isinstance(thumbnail, dict):
            resolutions = thumbnail.get("resolutions")
            if isinstance(resolutions, list) and resolutions:
                image_url = resolutions[0].get("url")

        title = content.get("title") or "Untitled market update"
        if not isinstance(title, str):
            continue

        normalized.append(
            {
                "title": title,
                "publisher": publisher,
                "url": link,
                "imageUrl": image_url,
                "publishedAt": content.get("pubDate")
                or content.get("providerPublishTime")
                or content.get("displayTime"),
            }
        )

    return normalized

