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

Create `.env.local`:

```bash
STOCKSAGE_API_URL=http://localhost:8000
```

For production, set `STOCKSAGE_API_URL` to the deployed FastAPI service URL.

