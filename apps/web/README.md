# StockSage Web

Next.js dashboard for StockSage. Deploy this folder as the Vercel project root.

## Commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

## Environment

For local development, the dashboard defaults to `http://localhost:8000` if `STOCKSAGE_API_URL` is not set. You can still create `.env.local` explicitly:

```bash
STOCKSAGE_API_URL=http://localhost:8000
```

For production, set `STOCKSAGE_API_URL` in Vercel to the deployed FastAPI service URL, such as a Render web service.
