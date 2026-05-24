"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BookmarkPlus,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Globe,
  Info,
  LayoutDashboard,
  LineChart,
  Loader2,
  Menu,
  Newspaper,
  RefreshCcw,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
  Terminal,
  Trash2,
  TrendingUp,
  WalletCards,
  XCircle,
} from "lucide-react";

import { createMockAnalysis, mockAnalysis } from "@/lib/mock-analysis";
import type {
  AnalyzeRequest,
  ChartPoint,
  ForecastPoint,
  StockSageAnalysis,
  Timeframe,
  Tone,
} from "@/lib/stocksage-types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STORAGE_KEY = "stocksage:v1";

const quickTickers = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "AMD", "SPY", "QQQ"];

const navItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "forecast", label: "Forecast", icon: LineChart },
  { id: "watchlist", label: "Watchlist", icon: Star },
  { id: "news", label: "Market News", icon: Newspaper },
  { id: "profile", label: "Company Profile", icon: Building2 },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

type SectionId = (typeof navItems)[number]["id"];

type PersistedState = {
  displayName: string;
  ticker: string;
  capital: number;
  targetPct: number;
  lossPct: number;
  timeframe: Timeframe;
  watchlist: string[];
  recent: string[];
};

const defaults: PersistedState = {
  displayName: "",
  ticker: "NVDA",
  capital: 1000,
  targetPct: 15,
  lossPct: 5,
  timeframe: "1m",
  watchlist: ["NVDA", "AAPL", "MSFT", "SPY"],
  recent: ["NVDA"],
};

function currency(value: number | null | undefined, compact = false) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 2 : 2,
  }).format(value);
}

function percent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function ratio(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return `1:${value.toFixed(2)}`;
}

function formattedDate(value: string | number | null | undefined) {
  if (!value) {
    return "Recently";
  }
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "Recently";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toneClasses(tone: Tone | "neutral") {
  if (tone === "positive") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (tone === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  if (tone === "negative") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  }
  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function initialsForName(name: string) {
  const clean = name.trim();

  if (!clean) {
    return "SS";
  }

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Analyst";
}

export function StockSageDashboard() {
  const [active, setActive] = useState<SectionId>("overview");
  const [displayName, setDisplayName] = useState(defaults.displayName);
  const [draftName, setDraftName] = useState(defaults.displayName);
  const [ticker, setTicker] = useState(defaults.ticker);
  const [capital, setCapital] = useState(defaults.capital);
  const [targetPct, setTargetPct] = useState(defaults.targetPct);
  const [lossPct, setLossPct] = useState(defaults.lossPct);
  const [timeframe, setTimeframe] = useState<Timeframe>(defaults.timeframe);
  const [watchlist, setWatchlist] = useState(defaults.watchlist);
  const [recent, setRecent] = useState(defaults.recent);
  const [analysis, setAnalysis] = useState<StockSageAnalysis>(mockAnalysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"demo" | "live">("demo");
  const [hydrated, setHydrated] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          setShowNamePrompt(true);
          return;
        }
        const parsed = JSON.parse(stored) as Partial<PersistedState>;
        const savedName = parsed.displayName || defaults.displayName;
        setDisplayName(savedName);
        setDraftName(savedName);
        setShowNamePrompt(!savedName);
        setTicker(parsed.ticker || defaults.ticker);
        setCapital(parsed.capital || defaults.capital);
        setTargetPct(parsed.targetPct || defaults.targetPct);
        setLossPct(parsed.lossPct || defaults.lossPct);
        setTimeframe(parsed.timeframe || defaults.timeframe);
        setWatchlist(parsed.watchlist?.length ? parsed.watchlist : defaults.watchlist);
        setRecent(parsed.recent?.length ? parsed.recent : defaults.recent);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
        setShowNamePrompt(true);
      } finally {
        setHydrated(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const payload: PersistedState = {
      displayName,
      ticker,
      capital,
      targetPct,
      lossPct,
      timeframe,
      watchlist,
      recent,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [capital, displayName, hydrated, lossPct, recent, targetPct, ticker, timeframe, watchlist]);

  const requestPayload: AnalyzeRequest = useMemo(
    () => ({
      ticker: normalizeTicker(ticker || analysis.ticker),
      capital,
      targetPct,
      lossPct,
      timeframe,
    }),
    [analysis.ticker, capital, lossPct, targetPct, ticker, timeframe],
  );

  async function analyze(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    const optimisticAnalysis = createMockAnalysis(requestPayload.ticker, requestPayload.timeframe);
    setAnalysis(optimisticAnalysis);
    setSource("demo");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "StockSage analysis failed.");
      }

      setAnalysis(payload as StockSageAnalysis);
      setSource("live");
      setRecent((items) => [requestPayload.ticker, ...items.filter((item) => item !== requestPayload.ticker)].slice(0, 6));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "StockSage analysis failed.");
      setAnalysis(optimisticAnalysis);
      setSource("demo");
    } finally {
      setLoading(false);
    }
  }

  function addToWatchlist(symbol = analysis.ticker) {
    const normalized = normalizeTicker(symbol);
    if (!normalized) {
      return;
    }
    setWatchlist((items) => [normalized, ...items.filter((item) => item !== normalized)].slice(0, 12));
  }

  function removeFromWatchlist(symbol: string) {
    setWatchlist((items) => items.filter((item) => item !== symbol));
  }

  function chooseTicker(symbol: string) {
    const normalized = normalizeTicker(symbol);
    setTicker(normalized);
    setAnalysis(createMockAnalysis(normalized, timeframe));
    setSource("demo");
    setError(null);
    setActive("overview");
    window.requestAnimationFrame(() => {
      void analyzeTicker(normalized);
    });
  }

  async function analyzeTicker(symbol: string) {
    const normalized = normalizeTicker(symbol);
    const payload: AnalyzeRequest = {
      ticker: normalized,
      capital,
      targetPct,
      lossPct,
      timeframe,
    };
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "StockSage analysis failed.");
      }

      setAnalysis(result as StockSageAnalysis);
      setSource("live");
      setRecent((items) => [normalized, ...items.filter((item) => item !== normalized)].slice(0, 6));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "StockSage analysis failed.");
      setSource("demo");
    } finally {
      setLoading(false);
    }
  }

  function saveDisplayName(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const clean = draftName.trim();
    if (!clean) {
      return;
    }
    setDisplayName(clean);
    setDraftName(clean);
    setShowNamePrompt(false);
  }

  function resetDisplayName() {
    setDisplayName("");
    setDraftName("");
    setShowNamePrompt(true);
  }

  const positiveMove = analysis.quote.changePct >= 0;
  const userInitials = initialsForName(displayName);

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="stock-dashboard">
      <Sidebar active={active} onNavigate={setActive} />

      <div className="lg:pl-64">
        <TopBar
          active={active}
          source={source}
          analysis={analysis}
          displayName={displayName}
          initials={userInitials}
          onNavigate={setActive}
          onChooseTicker={chooseTicker}
          onEditName={() => {
            setDraftName(displayName);
            setShowNamePrompt(true);
          }}
        />

        <main className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card/70 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-2xl font-semibold text-foreground sm:text-3xl">
                      {analysis.profile.name}
                    </h1>
                    <Badge className="border-cyan-500/30 bg-cyan-500/10 font-mono text-cyan-300">
                      {analysis.ticker}
                    </Badge>
                    <Badge className={cn("border", toneClasses(analysis.signal.tone))}>
                      {analysis.signal.recommendation}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>{analysis.profile.sector}</span>
                    <span className="h-1 w-1 rounded-full bg-zinc-700" />
                    <span>Updated {formattedDate(analysis.generatedAt)}</span>
                    <span className="h-1 w-1 rounded-full bg-zinc-700" />
                    <span>{source === "live" ? "Live API" : "Demo data"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => addToWatchlist()}
                        aria-label="Add ticker to watchlist"
                      >
                        <BookmarkPlus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Add to watchlist</TooltipContent>
                  </Tooltip>
                  <Button type="button" onClick={() => analyze()} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    Refresh
                  </Button>
                </div>
              </div>

              {error ? <ErrorBanner message={error} /> : null}

              {active === "overview" ? (
                <OverviewSection
                  analysis={analysis}
                  loading={loading}
                  positiveMove={positiveMove}
                  capital={capital}
                />
              ) : null}

              {active === "forecast" ? <ForecastSection analysis={analysis} loading={loading} /> : null}
              {active === "watchlist" ? (
                <WatchlistSection
                  analysis={analysis}
                  watchlist={watchlist}
                  recent={recent}
                  onChooseTicker={chooseTicker}
                  onRemove={removeFromWatchlist}
                  onAdd={addToWatchlist}
                />
              ) : null}
              {active === "news" ? <NewsSection analysis={analysis} /> : null}
              {active === "profile" ? <ProfileSection analysis={analysis} /> : null}
              {active === "settings" ? (
                <SettingsSection
                  capital={capital}
                  targetPct={targetPct}
                  lossPct={lossPct}
                  timeframe={timeframe}
                  setCapital={setCapital}
                  setTargetPct={setTargetPct}
                  setLossPct={setLossPct}
                  setTimeframe={setTimeframe}
                  onAnalyze={() => analyze()}
                  loading={loading}
                  displayName={displayName}
                  draftName={draftName}
                  setDraftName={setDraftName}
                  onSaveName={saveDisplayName}
                  onResetName={resetDisplayName}
                />
              ) : null}
            </div>

            <ControlRail
              ticker={ticker}
              capital={capital}
              targetPct={targetPct}
              lossPct={lossPct}
              timeframe={timeframe}
              setTicker={setTicker}
              setCapital={setCapital}
              setTargetPct={setTargetPct}
              setLossPct={setLossPct}
              setTimeframe={setTimeframe}
              onAnalyze={analyze}
              loading={loading}
              onQuickTicker={chooseTicker}
              onAddWatchlist={addToWatchlist}
            />
          </section>
        </main>
      </div>

      {hydrated && showNamePrompt ? (
        <NamePrompt
          draftName={draftName}
          setDraftName={setDraftName}
          onSave={saveDisplayName}
          onSkip={() => {
            setDraftName("");
            setShowNamePrompt(false);
          }}
        />
      ) : null}
    </div>
  );
}

function StockSageBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", compact && "gap-2")}>
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-lg border border-emerald-400/35 bg-emerald-400/10 shadow-[0_0_24px_rgba(16,185,129,0.12)]",
          compact ? "h-9 w-9" : "h-11 w-11",
        )}
      >
        <svg viewBox="0 0 36 36" className={compact ? "h-6 w-6" : "h-7 w-7"} aria-hidden="true">
          <path d="M7 23.5 13.2 17l4.5 4.2L28.5 10" fill="none" stroke="#22c55e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M25.5 9.5h4v4" fill="none" stroke="#06b6d4" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="25" r="2.4" fill="#06b6d4" />
          <circle cx="29" cy="9" r="1.7" fill="#a7f3d0" />
        </svg>
      </div>
      <div className="min-w-0">
        <div className={cn("truncate font-semibold tracking-normal", compact ? "text-base" : "text-lg")}>
          Stock<span className="text-emerald-300">Sage</span>
        </div>
        {!compact ? <div className="truncate text-xs text-muted-foreground">AI market terminal</div> : null}
      </div>
    </div>
  );
}

function Sidebar({ active, onNavigate }: { active: SectionId; onNavigate: (id: SectionId) => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-black/70 backdrop-blur lg:flex lg:flex-col">
      <div className="flex h-20 items-center border-b border-border px-4">
        <StockSageBrand />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors",
                active === item.id
                  ? "bg-zinc-900 text-foreground ring-1 ring-emerald-400/20"
                  : "hover:bg-zinc-900/70 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", active === item.id && "text-emerald-400")} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <div className="rounded-lg border border-border bg-zinc-950 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4 text-cyan-300" />
            Research mode
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Signals are decision support only. Validate before trading.
          </p>
        </div>
      </div>
    </aside>
  );
}

function TopBar({
  active,
  source,
  analysis,
  displayName,
  initials,
  onNavigate,
  onChooseTicker,
  onEditName,
}: {
  active: SectionId;
  source: "demo" | "live";
  analysis: StockSageAnalysis;
  displayName: string;
  initials: string;
  onNavigate: (id: SectionId) => void;
  onChooseTicker: (ticker: string) => void;
  onEditName: () => void;
}) {
  const current = navItems.find((item) => item.id === active);
  const CurrentIcon = current?.icon;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-black/85 shadow-[0_1px_0_rgba(16,185,129,0.08)] backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
              data-testid="mobile-menu-button"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-border bg-black p-0">
            <SheetHeader className="border-b border-border px-4 py-5 text-left">
              <SheetTitle>
                <StockSageBrand />
              </SheetTitle>
            </SheetHeader>
            <nav className="space-y-1 p-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      "flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground",
                      active === item.id && "bg-zinc-900 text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <div className="hidden shrink-0 lg:block">
          <StockSageBrand compact />
        </div>

        <div className="min-w-0 flex-1 lg:pl-3">
          <div className="flex items-center gap-2">
            {CurrentIcon ? <CurrentIcon className="h-4 w-4 text-emerald-400" /> : null}
            <h2 className="truncate text-base font-semibold sm:text-lg">{current?.label}</h2>
            <Badge variant="outline" className="hidden border-zinc-700 font-mono text-xs text-muted-foreground sm:inline-flex">
              {source === "live" ? "LIVE" : "DEMO"}
            </Badge>
          </div>
        </div>

        <div className="hidden min-w-64 items-center gap-2 rounded-md border border-border bg-zinc-950/90 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:flex">
          <Search className="h-4 w-4 text-muted-foreground" />
          <button
            type="button"
            className="text-sm text-muted-foreground"
            onClick={() => onChooseTicker(analysis.ticker)}
          >
            Search active ticker...
          </button>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Alerts placeholder</TooltipContent>
        </Tooltip>
        <button
          type="button"
          onClick={onEditName}
          className="hidden max-w-32 truncate text-right text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
        >
          {displayName ? `Hi, ${firstName(displayName)}` : "Set name"}
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onEditName}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-300/40 bg-cyan-400 text-sm font-semibold text-black shadow-[0_0_24px_rgba(34,211,238,0.16)] transition-transform hover:scale-[1.03]"
              aria-label={displayName ? `Edit profile for ${displayName}` : "Set display name"}
            >
              {initials}
            </button>
          </TooltipTrigger>
          <TooltipContent>{displayName ? `Signed in as ${displayName}` : "Set display name"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

function ControlRail({
  ticker,
  capital,
  targetPct,
  lossPct,
  timeframe,
  setTicker,
  setCapital,
  setTargetPct,
  setLossPct,
  setTimeframe,
  onAnalyze,
  loading,
  onQuickTicker,
  onAddWatchlist,
}: {
  ticker: string;
  capital: number;
  targetPct: number;
  lossPct: number;
  timeframe: Timeframe;
  setTicker: (value: string) => void;
  setCapital: (value: number) => void;
  setTargetPct: (value: number) => void;
  setLossPct: (value: number) => void;
  setTimeframe: (value: Timeframe) => void;
  onAnalyze: (event?: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  onQuickTicker: (ticker: string) => void;
  onAddWatchlist: (ticker?: string) => void;
}) {
  return (
    <aside className="min-w-0 xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)] xl:overflow-y-auto">
      <form onSubmit={onAnalyze} className="rounded-lg border border-border bg-card/70 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Trade Parameters</h3>
            <p className="text-sm text-muted-foreground">Ticker, capital, risk.</p>
          </div>
          <SlidersHorizontal className="h-5 w-5 text-cyan-300" />
        </div>

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Ticker Symbol</span>
            <div className="flex gap-2">
              <Input
                value={ticker}
                onChange={(event) => setTicker(event.target.value.toUpperCase())}
                className="font-mono"
                placeholder="NVDA"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => onAddWatchlist(ticker)} aria-label="Save ticker">
                <Star className="h-4 w-4" />
              </Button>
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Capital Deployment</span>
            <Input
              value={capital}
              type="number"
              min={1}
              onChange={(event) => setCapital(Number(event.target.value))}
              className="font-mono"
            />
          </label>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-muted-foreground">Target Profit</span>
              <span className="font-mono text-emerald-300">{targetPct}%</span>
            </div>
            <Slider value={[targetPct]} min={1} max={100} step={1} onValueChange={([value]) => setTargetPct(value)} />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-muted-foreground">Max Loss</span>
              <span className="font-mono text-rose-300">{lossPct}%</span>
            </div>
            <Slider value={[lossPct]} min={1} max={50} step={1} onValueChange={([value]) => setLossPct(value)} />
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Time Horizon</span>
            <Select value={timeframe} onValueChange={(value) => setTimeframe(value as Timeframe)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1w">1 Week</SelectItem>
                <SelectItem value="1m">1 Month</SelectItem>
                <SelectItem value="3m">3 Months</SelectItem>
                <SelectItem value="6m">6 Months</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <Button className="w-full" disabled={loading} data-testid="analyze-button">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Execute Analysis
          </Button>
        </div>
      </form>

      <div className="mt-4 rounded-lg border border-border bg-card/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Quick Tickers</h3>
          <Gauge className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {quickTickers.map((symbol) => (
            <Button key={symbol} type="button" variant="outline" size="sm" className="font-mono" onClick={() => onQuickTicker(symbol)}>
              {symbol}
            </Button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-amber-400/25 bg-[linear-gradient(135deg,rgba(245,158,11,0.14),rgba(8,8,8,0.88))] shadow-[0_0_32px_rgba(245,158,11,0.08)]">
      <div className="flex items-start gap-3 p-4 text-sm text-amber-50">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-300/30 bg-amber-400/10">
          <AlertTriangle className="h-4 w-4 text-amber-300" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-amber-100">Live analysis is unavailable</div>
          <div className="mt-1 leading-6 text-amber-100/75">{message}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-amber-100/65">
            <Terminal className="h-3.5 w-3.5" />
            <span className="font-mono">cd services/api && uvicorn app.main:app --reload --port 8000</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NamePrompt({
  draftName,
  setDraftName,
  onSave,
  onSkip,
}: {
  draftName: string;
  setDraftName: (value: string) => void;
  onSave: (event?: FormEvent<HTMLFormElement>) => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <form
        onSubmit={onSave}
        className="w-full max-w-md rounded-lg border border-emerald-400/25 bg-zinc-950 p-5 shadow-[0_0_60px_rgba(16,185,129,0.12)]"
      >
        <div className="mb-5">
          <StockSageBrand compact />
        </div>
        <h2 className="text-2xl font-semibold">Welcome to StockSage</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Enter your display name so the dashboard can personalize your profile avatar and settings.
        </p>
        <label className="mt-5 block space-y-2">
          <span className="text-sm font-medium text-muted-foreground">Display name</span>
          <Input
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Marc Asas"
            maxLength={48}
          />
        </label>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onSkip}>
            Skip for now
          </Button>
          <Button type="submit" disabled={!draftName.trim()}>
            Save Name
          </Button>
        </div>
      </form>
    </div>
  );
}

function OverviewSection({
  analysis,
  loading,
  positiveMove,
  capital,
}: {
  analysis: StockSageAnalysis;
  loading: boolean;
  positiveMove: boolean;
  capital: number;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Last Price"
          value={currency(analysis.quote.price)}
          change={percent(analysis.quote.changePct, 2)}
          tone={positiveMove ? "positive" : "negative"}
          icon={positiveMove ? ArrowUpRight : ArrowDownRight}
          loading={loading}
        />
        <MetricCard
          label="AI Confidence"
          value={`${(analysis.signal.confidence * 100).toFixed(1)}%`}
          change={analysis.signal.trend.toUpperCase()}
          tone={analysis.signal.tone}
          icon={Activity}
          loading={loading}
        />
        <MetricCard
          label="Forecast Price"
          value={currency(analysis.forecast.price)}
          change={percent(analysis.forecast.expectedReturnPct, 2)}
          tone={analysis.forecast.expectedReturnPct >= 0 ? "positive" : "negative"}
          icon={LineChart}
          loading={loading}
        />
        <MetricCard
          label="Risk / Reward"
          value={ratio(analysis.metrics.riskReward)}
          change={`${currency(capital * (analysis.metrics.riskReward / 100), true)} modeled`}
          tone={analysis.metrics.riskReward >= 2 ? "positive" : "warning"}
          icon={WalletCards}
          loading={loading}
        />
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Price, Forecast, and Risk Levels</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Candlesticks with MA20, MA50, forecast range, target, and stop.</p>
            </div>
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-300">
              {analysis.forecast.label}
            </Badge>
          </CardHeader>
          <CardContent>
            <PriceChart analysis={analysis} />
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <StrategyPanel analysis={analysis} />
          <RiskPanel analysis={analysis} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <IndicatorPanel analysis={analysis} />
        <ForecastSummary analysis={analysis} />
        <MarketPulse analysis={analysis} />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  change,
  tone,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  change: string;
  tone: Tone | "neutral";
  icon: typeof Activity;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            {loading ? <Skeleton className="mt-3 h-8 w-28" /> : <div className="mt-3 truncate font-mono text-3xl font-semibold">{value}</div>}
          </div>
          <div className={cn("rounded-md border p-2", toneClasses(tone))}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className={cn("mt-4 inline-flex rounded-md border px-2 py-1 font-mono text-xs", toneClasses(tone))}>{change}</div>
      </CardContent>
    </Card>
  );
}

function PriceChart({ analysis }: { analysis: StockSageAnalysis }) {
  const history = analysis.chart.slice(-92);
  const forecast = analysis.forecast.path;
  const width = 920;
  const height = 430;
  const top = 18;
  const priceBottom = 312;
  const volumeTop = 340;
  const volumeHeight = 58;
  const total = history.length + forecast.length + 1;

  const yValues = [
    ...history.flatMap((point) => [point.high, point.low, point.ma20, point.ma50].filter((value): value is number => value !== null)),
    ...forecast.flatMap((point) => [point.upper, point.lower, point.price]),
    analysis.metrics.targetPrice,
    analysis.metrics.stopLossPrice,
  ];
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const pad = (maxY - minY) * 0.1 || 1;
  const yMin = minY - pad;
  const yMax = maxY + pad;
  const maxVolume = Math.max(...history.map((point) => point.volume));
  const candleWidth = Math.max(2.5, Math.min(7, width / total * 0.5));

  const xForHistory = (index: number) => (index / (total - 1)) * width;
  const xForForecast = (index: number) => ((history.length + index) / (total - 1)) * width;
  const yForPrice = (value: number) => top + ((yMax - value) / (yMax - yMin)) * (priceBottom - top);
  const yForVolume = (value: number) => volumeTop + volumeHeight - (value / maxVolume) * volumeHeight;

  const linePath = (points: Array<{ x: number; y: number }>) =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const svgNum = (value: number) => value.toFixed(2);

  const ma20 = history
    .map((point, index) => (point.ma20 ? { x: xForHistory(index), y: yForPrice(point.ma20) } : null))
    .filter((point): point is { x: number; y: number } => Boolean(point));
  const ma50 = history
    .map((point, index) => (point.ma50 ? { x: xForHistory(index), y: yForPrice(point.ma50) } : null))
    .filter((point): point is { x: number; y: number } => Boolean(point));

  const forecastLine = [
    { x: xForHistory(history.length - 1), y: yForPrice(history[history.length - 1].close) },
    ...forecast.map((point, index) => ({ x: xForForecast(index + 1), y: yForPrice(point.price) })),
  ];
  const upper = [
    { x: xForHistory(history.length - 1), y: yForPrice(history[history.length - 1].close) },
    ...forecast.map((point, index) => ({ x: xForForecast(index + 1), y: yForPrice(point.upper) })),
  ];
  const lower = [
    ...forecast
      .map((point, index) => ({ x: xForForecast(index + 1), y: yForPrice(point.lower) }))
      .reverse(),
    { x: xForHistory(history.length - 1), y: yForPrice(history[history.length - 1].close) },
  ];
  const rangePath = `${upper.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")} ${lower
    .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")} Z`;

  const targetY = yForPrice(analysis.metrics.targetPrice);
  const stopY = yForPrice(analysis.metrics.stopLossPrice);

  return (
    <div className="relative h-[360px] w-full sm:h-[430px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label={`${analysis.ticker} price forecast chart`}>
        <defs>
          <linearGradient id="forecast-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {Array.from({ length: 5 }).map((_, index) => {
          const y = top + (index / 4) * (priceBottom - top);
          return <line key={index} x1="0" x2={width} y1={y} y2={y} stroke="#27272a" strokeDasharray="4 6" />;
        })}

        <path d={rangePath} fill="url(#forecast-fill)" />
        <path d={linePath(forecastLine)} fill="none" stroke="#06b6d4" strokeDasharray="8 7" strokeWidth="3" />
        {ma20.length > 1 ? <path d={linePath(ma20)} fill="none" stroke="#f59e0b" strokeWidth="2" opacity="0.85" /> : null}
        {ma50.length > 1 ? <path d={linePath(ma50)} fill="none" stroke="#22c55e" strokeWidth="2" opacity="0.9" /> : null}

        <line x1="0" x2={width} y1={svgNum(targetY)} y2={svgNum(targetY)} stroke="#22c55e" strokeDasharray="7 7" opacity="0.7" />
        <line x1="0" x2={width} y1={svgNum(stopY)} y2={svgNum(stopY)} stroke="#fb7185" strokeDasharray="7 7" opacity="0.7" />

        {history.map((point, index) => {
          const x = xForHistory(index);
          const openY = yForPrice(point.open);
          const closeY = yForPrice(point.close);
          const highY = yForPrice(point.high);
          const lowY = yForPrice(point.low);
          const up = point.close >= point.open;
          const color = up ? "#22c55e" : "#fb7185";
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(2, Math.abs(closeY - openY));
          const volumeY = yForVolume(point.volume);
          return (
            <g key={point.date}>
              <line x1={svgNum(x)} x2={svgNum(x)} y1={svgNum(highY)} y2={svgNum(lowY)} stroke={color} strokeWidth="1.5" opacity="0.9" />
              <rect
                x={svgNum(x - candleWidth / 2)}
                y={svgNum(bodyY)}
                width={svgNum(candleWidth)}
                height={svgNum(bodyHeight)}
                rx="1"
                fill={color}
                opacity="0.85"
              />
              <rect
                x={svgNum(x - candleWidth / 2)}
                y={svgNum(volumeY)}
                width={svgNum(candleWidth)}
                height={svgNum(volumeTop + volumeHeight - volumeY)}
                rx="1"
                fill={color}
                opacity="0.24"
              />
            </g>
          );
        })}

        <text x="0" y={svgNum(targetY - 8)} fill="#22c55e" fontSize="12" fontFamily="monospace">
          TP {currency(analysis.metrics.targetPrice)}
        </text>
        <text x="0" y={svgNum(stopY + 17)} fill="#fb7185" fontSize="12" fontFamily="monospace">
          SL {currency(analysis.metrics.stopLossPrice)}
        </text>
        <text x={width - 120} y="20" fill="#a1a1aa" fontSize="12">
          MA20
        </text>
        <circle cx={width - 132} cy="16" r="5" fill="#f59e0b" />
        <text x={width - 62} y="20" fill="#a1a1aa" fontSize="12">
          MA50
        </text>
        <circle cx={width - 74} cy="16" r="5" fill="#22c55e" />
      </svg>
    </div>
  );
}

function StrategyPanel({ analysis }: { analysis: StockSageAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution Strategy</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("rounded-lg border p-4", toneClasses(analysis.signal.tone))}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm opacity-80">Model recommendation</div>
              <div className="mt-1 text-2xl font-semibold">{analysis.signal.recommendation}</div>
            </div>
            {analysis.signal.tone === "positive" ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
          </div>
          <ProgressBar value={analysis.signal.confidence * 100} tone={analysis.signal.tone} className="mt-4" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <SmallStat label="Trend" value={analysis.signal.trend} />
          <SmallStat label="Momentum" value={analysis.metrics.momentum} />
          <SmallStat label="MA50" value={analysis.metrics.maTrend} />
          <SmallStat label="Volume" value={analysis.metrics.volumeState} />
        </div>
      </CardContent>
    </Card>
  );
}

function RiskPanel({ analysis }: { analysis: StockSageAnalysis }) {
  const total = Math.max(analysis.metrics.potentialProfit + analysis.metrics.potentialLoss, 1);
  const lossWidth = (analysis.metrics.potentialLoss / total) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <SmallStat label="Target" value={currency(analysis.metrics.targetPrice)} positive />
          <SmallStat label="Stop Loss" value={currency(analysis.metrics.stopLossPrice)} negative />
        </div>
        <div>
          <div className="mb-2 flex justify-between text-sm text-muted-foreground">
            <span>Capital at risk vs potential gain</span>
            <span className="font-mono">{ratio(analysis.metrics.riskReward)}</span>
          </div>
          <div className="flex h-10 overflow-hidden rounded-md border border-border bg-zinc-950">
            <div className="flex items-center justify-center bg-rose-500/20 text-xs text-rose-200" style={{ width: `${lossWidth}%` }}>
              -{currency(analysis.metrics.potentialLoss, true)}
            </div>
            <div className="flex flex-1 items-center justify-center bg-emerald-500/20 text-xs text-emerald-200">
              +{currency(analysis.metrics.potentialProfit, true)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IndicatorPanel({ analysis }: { analysis: StockSageAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Technical State</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 flex justify-between text-sm text-muted-foreground">
            <span>RSI (14)</span>
            <span className="font-mono text-foreground">{analysis.metrics.rsi.toFixed(1)}</span>
          </div>
          <div className="relative h-3 rounded-full bg-zinc-900">
            <div className="absolute left-0 top-0 h-3 w-[30%] rounded-l-full bg-cyan-500/20" />
            <div className="absolute right-0 top-0 h-3 w-[30%] rounded-r-full bg-rose-500/20" />
            <div className="absolute top-[-5px] h-5 w-2 rounded-full bg-amber-300" style={{ left: `calc(${Math.min(Math.max(analysis.metrics.rsi, 0), 100)}% - 4px)` }} />
          </div>
        </div>
        <RsiSparkline points={analysis.chart.slice(-48)} />
      </CardContent>
    </Card>
  );
}

function ForecastSummary({ analysis }: { analysis: StockSageAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Forecast Range</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SmallStat label="Expected price" value={currency(analysis.forecast.price)} positive={analysis.forecast.expectedReturnPct >= 0} />
        <SmallStat label="80% lower" value={currency(analysis.forecast.lower)} />
        <SmallStat label="80% upper" value={currency(analysis.forecast.upper)} />
        <SmallStat label="Validation MAPE" value={`${analysis.forecast.validationMape.toFixed(1)}%`} />
      </CardContent>
    </Card>
  );
}

function MarketPulse({ analysis }: { analysis: StockSageAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Pulse</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SmallStat label="Volatility" value={`${analysis.metrics.volatility.toFixed(1)}%`} />
        <SmallStat label="Market cap" value={analysis.profile.marketCapLabel || "N/A"} />
        <SmallStat label="Beta" value={analysis.profile.beta?.toFixed(2) || "N/A"} />
        <SmallStat label="Avg volume" value={analysis.profile.averageVolume?.toLocaleString() || "N/A"} />
      </CardContent>
    </Card>
  );
}

function ForecastSection({ analysis, loading }: { analysis: StockSageAnalysis; loading: boolean }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Forecast Horizon" value={`${analysis.forecast.horizonDays}d`} change={analysis.forecast.label} tone="neutral" icon={CalendarDays} loading={loading} />
        <MetricCard label="Expected Move" value={percent(analysis.forecast.expectedReturnPct, 2)} change={currency(analysis.forecast.price)} tone={analysis.forecast.expectedReturnPct >= 0 ? "positive" : "negative"} icon={TrendingUp} loading={loading} />
        <MetricCard label="Uncertainty Width" value={currency(analysis.forecast.upper - analysis.forecast.lower)} change="80% range" tone="warning" icon={Gauge} loading={loading} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Forecast Path</CardTitle>
        </CardHeader>
        <CardContent>
          <ForecastPathChart analysis={analysis} />
        </CardContent>
      </Card>
      <div className="grid gap-5 md:grid-cols-3">
        {analysis.forecast.path.slice(-3).map((point) => (
          <Card key={point.date}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{point.date}</p>
              <div className="mt-2 font-mono text-2xl font-semibold">{currency(point.price)}</div>
              <p className="mt-2 text-sm text-muted-foreground">
                {currency(point.lower)} to {currency(point.upper)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ForecastPathChart({ analysis }: { analysis: StockSageAnalysis }) {
  const width = 900;
  const height = 280;
  const points = analysis.forecast.path;
  const all = points.flatMap((point) => [point.lower, point.price, point.upper]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const y = (value: number) => 20 + ((max - value) / (max - min || 1)) * 220;
  const x = (index: number) => (index / Math.max(points.length - 1, 1)) * width;
  const path = (key: keyof ForecastPoint) =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(point[key] as number).toFixed(2)}`).join(" ");
  const upper = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(point.upper).toFixed(2)}`).join(" ");
  const lower = points
    .map((point, index) => `L ${x(index).toFixed(2)} ${y(point.lower).toFixed(2)}`)
    .reverse()
    .join(" ");

  return (
    <div className="h-[280px] w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Forecast path">
        {Array.from({ length: 4 }).map((_, index) => {
          const yLine = 20 + index * 70;
          return <line key={index} x1="0" x2={width} y1={yLine} y2={yLine} stroke="#27272a" strokeDasharray="4 6" />;
        })}
        <path d={`${upper} ${lower} Z`} fill="#06b6d4" opacity="0.14" />
        <path d={path("price")} fill="none" stroke="#06b6d4" strokeWidth="3" />
      </svg>
    </div>
  );
}

function WatchlistSection({
  analysis,
  watchlist,
  recent,
  onChooseTicker,
  onRemove,
  onAdd,
}: {
  analysis: StockSageAnalysis;
  watchlist: string[];
  recent: string[];
  onChooseTicker: (ticker: string) => void;
  onRemove: (ticker: string) => void;
  onAdd: (ticker?: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-semibold">Saved Symbols</h3>
          <p className="text-sm text-muted-foreground">Stored locally in this browser.</p>
        </div>
        <Button type="button" onClick={() => onAdd(analysis.ticker)}>
          <BookmarkPlus className="h-4 w-4" />
          Add {analysis.ticker}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {watchlist.map((symbol) => (
          <Card key={symbol}>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <button type="button" className="min-w-0 text-left" onClick={() => onChooseTicker(symbol)}>
                <div className="font-mono text-2xl font-semibold">{symbol}</div>
                <div className="mt-1 text-sm text-muted-foreground">{symbol === analysis.ticker ? "Current analysis" : "Tap to load"}</div>
              </button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => onChooseTicker(symbol)} aria-label={`Analyze ${symbol}`}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(symbol)} aria-label={`Remove ${symbol}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Analysis</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {recent.map((symbol) => (
            <Button key={symbol} type="button" variant="outline" size="sm" className="font-mono" onClick={() => onChooseTicker(symbol)}>
              {symbol}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function NewsSection({ analysis }: { analysis: StockSageAnalysis }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {analysis.news.map((item) => (
        <a
          key={`${item.publisher}-${item.title}`}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-emerald-400/40"
        >
          <div className="aspect-[16/9] bg-zinc-900">
            {item.imageUrl ? (
              <div
                className="h-full w-full bg-cover bg-center opacity-75 transition-opacity group-hover:opacity-100"
                style={{ backgroundImage: `url(${item.imageUrl})` }}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Newspaper className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{item.publisher}</span>
              <span>{formattedDate(item.publishedAt)}</span>
            </div>
            <h3 className="line-clamp-3 text-lg font-semibold leading-7">{item.title}</h3>
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-300">
              Read story <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function ProfileSection({ analysis }: { analysis: StockSageAnalysis }) {
  const metrics = [
    ["Market Cap", analysis.profile.marketCapLabel || "N/A"],
    ["Trailing P/E", analysis.profile.trailingPe?.toFixed(2) || "N/A"],
    ["Forward P/E", analysis.profile.forwardPe?.toFixed(2) || "N/A"],
    ["Price / Book", analysis.profile.priceToBook?.toFixed(2) || "N/A"],
    ["Profit Margin", analysis.profile.profitMargin ? percent(analysis.profile.profitMargin * 100, 2) : "N/A"],
    ["Operating Margin", analysis.profile.operatingMargin ? percent(analysis.profile.operatingMargin * 100, 2) : "N/A"],
    ["Return on Equity", analysis.profile.returnOnEquity ? percent(analysis.profile.returnOnEquity * 100, 2) : "N/A"],
    ["Dividend Yield", analysis.profile.dividendYield ? percent(analysis.profile.dividendYield * 100, 2) : "N/A"],
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h3 className="text-2xl font-semibold">{analysis.profile.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {analysis.profile.industry} / {analysis.profile.sector}
              </p>
            </div>
            {analysis.profile.website ? (
              <Button type="button" variant="outline" asChild>
                <a href={analysis.profile.website} target="_blank" rel="noreferrer">
                  <Globe className="h-4 w-4" />
                  Website
                </a>
              </Button>
            ) : null}
          </div>
          <Separator className="my-5" />
          <p className="max-w-5xl leading-7 text-muted-foreground">{analysis.profile.summary}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 font-mono text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SettingsSection({
  capital,
  targetPct,
  lossPct,
  timeframe,
  displayName,
  draftName,
  setCapital,
  setTargetPct,
  setLossPct,
  setTimeframe,
  setDraftName,
  onAnalyze,
  onSaveName,
  onResetName,
  loading,
}: {
  capital: number;
  targetPct: number;
  lossPct: number;
  timeframe: Timeframe;
  displayName: string;
  draftName: string;
  setCapital: (value: number) => void;
  setTargetPct: (value: number) => void;
  setLossPct: (value: number) => void;
  setTimeframe: (value: Timeframe) => void;
  setDraftName: (value: string) => void;
  onAnalyze: () => void;
  onSaveName: (event?: FormEvent<HTMLFormElement>) => void;
  onResetName: () => void;
  loading: boolean;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Profile and Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={onSaveName} className="rounded-lg border border-border bg-zinc-950 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-cyan-300/40 bg-cyan-400 font-semibold text-black">
                {initialsForName(displayName || draftName)}
              </div>
              <label className="min-w-0 flex-1 space-y-2">
                <span className="text-sm text-muted-foreground">Display name</span>
                <Input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="Marc Asas"
                  maxLength={48}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onResetName}>
                Reset Name
              </Button>
              <Button type="submit" disabled={!draftName.trim()}>
                Save Profile
              </Button>
            </div>
          </form>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-muted-foreground">Default Capital</span>
              <Input value={capital} type="number" onChange={(event) => setCapital(Number(event.target.value))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-muted-foreground">Default Horizon</span>
              <Select value={timeframe} onValueChange={(value) => setTimeframe(value as Timeframe)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1w">1 Week</SelectItem>
                  <SelectItem value="1m">1 Month</SelectItem>
                  <SelectItem value="3m">3 Months</SelectItem>
                  <SelectItem value="6m">6 Months</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Target Profit</span>
              <span className="font-mono">{targetPct}%</span>
            </div>
            <Slider value={[targetPct]} min={1} max={100} step={1} onValueChange={([value]) => setTargetPct(value)} />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Max Loss</span>
              <span className="font-mono">{lossPct}%</span>
            </div>
            <Slider value={[lossPct]} min={1} max={50} step={1} onValueChange={([value]) => setLossPct(value)} />
          </div>
          <Button type="button" onClick={onAnalyze} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Analyze With Defaults
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deployment Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <div className="flex gap-3">
            <Info className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
            <p>Local development defaults to http://localhost:8000 when STOCKSAGE_API_URL is not set.</p>
          </div>
          <div className="flex gap-3">
            <Terminal className="mt-1 h-4 w-4 shrink-0 text-amber-300" />
            <p>For Vercel production, deploy the free FastAPI service on Render and set STOCKSAGE_API_URL to that URL.</p>
          </div>
          <div className="flex gap-3">
            <Shield className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
            <p>Preferences and watchlist are saved only in this browser.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SmallStat({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-zinc-950 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 truncate font-mono text-sm font-semibold capitalize", positive && "text-emerald-300", negative && "text-rose-300")}>
        {value}
      </div>
    </div>
  );
}

function ProgressBar({
  value,
  tone,
  className,
}: {
  value: number;
  tone: Tone | "neutral";
  className?: string;
}) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-black/30", className)}>
      <div
        className={cn(
          "h-full rounded-full",
          tone === "positive" && "bg-emerald-400",
          tone === "warning" && "bg-amber-400",
          tone === "negative" && "bg-rose-400",
          tone === "neutral" && "bg-cyan-400",
        )}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

function RsiSparkline({ points }: { points: ChartPoint[] }) {
  const width = 420;
  const height = 120;
  const rsi = points.map((point) => point.rsi ?? 50);
  const path = rsi
    .map((value, index) => {
      const x = (index / Math.max(rsi.length - 1, 1)) * width;
      const y = 15 + ((100 - value) / 100) * 90;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="h-28 w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="RSI trend">
        <line x1="0" x2={width} y1="42" y2="42" stroke="#fb7185" strokeDasharray="4 5" opacity="0.5" />
        <line x1="0" x2={width} y1="78" y2="78" stroke="#22c55e" strokeDasharray="4 5" opacity="0.5" />
        <path d={path} fill="none" stroke="#f59e0b" strokeWidth="3" />
      </svg>
    </div>
  );
}
