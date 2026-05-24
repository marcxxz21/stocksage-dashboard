from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Timeframe = Literal["1w", "1m", "3m", "6m"]


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ticker: str = Field(min_length=1, max_length=24)
    capital: float = Field(default=1000, ge=1)
    target_pct: float = Field(default=15, ge=0.1, le=500, alias="targetPct")
    loss_pct: float = Field(default=5, ge=0.1, le=100, alias="lossPct")
    timeframe: Timeframe = "1m"

