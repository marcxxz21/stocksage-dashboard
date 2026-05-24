# StockSage Dashboard

StockSage is a finance dashboard for stock analysis, forecasting, and trade planning. The app replaces the original Gradio interface with a Vercel-ready Next.js dashboard and a separate FastAPI model service.

## Architecture

- `apps/web`: Next.js App Router dashboard for Vercel.
- `services/api`: FastAPI service for `yfinance`, feature engineering, PyTorch signal inference, RidgeCV price forecasting, news, and profile data.
- `services/api/model_artifacts`: small trained model and scaler files from the original StockSage project.

The web app calls `POST /api/analyze`, which proxies to the FastAPI service configured by `STOCKSAGE_API_URL`.

## Local Development

Install and run the web app:

```bash
cd apps/web
npm install
npm run dev
```

Run the API service:

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Create `apps/web/.env.local`:

```bash
STOCKSAGE_API_URL=http://localhost:8000
```

## API

Health check:

```http
GET /health
```

Analyze:

```http
POST /analyze
Content-Type: application/json
```

```json
{
  "ticker": "NVDA",
  "capital": 1000,
  "targetPct": 15,
  "lossPct": 5,
  "timeframe": "1m"
}
```

## Deploy

### FastAPI on Render

Render can use `render.yaml` from the repo root. The API service uses:

- build command: `pip install -r requirements.txt`
- start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- health check: `/health`

After Render deploys, copy the service URL.

### Web on Vercel

Create a Vercel project with root directory `apps/web`.

Add this environment variable:

```bash
STOCKSAGE_API_URL=https://your-render-service.onrender.com
```

Then deploy from the Vercel dashboard or CLI.

## Validation

```bash
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
PYTHONPATH=services/api pytest services/api/tests
```

## Disclaimer

StockSage is for educational and research purposes only. It is not financial advice.

