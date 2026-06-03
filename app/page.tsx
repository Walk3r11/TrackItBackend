"use client";

import { ShieldCheck, Ticket, Users, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  checkDashboardSession,
  handleUnauthorized,
  loginDashboard,
  logoutDashboard,
} from "@/lib/dashboard-client";

type User = {
  id: string;
  name: string;
  email: string;
  lastActive: string;
};

type TicketItem = {
  id: string;
  subject: string;
  status: "open" | "pending" | "closed";
  updatedAt: string;
  priority?: "low" | "medium" | "high";
};

type TransactionItem = {
  id: string;
  title: string;
  amount: number;
  date: string;
  type: "debit" | "credit";
  category?: string;
};

type CardItem = {
  id: string;
  name: string;
  balance: number;
  limit: number;
  tags?: string[];
};

type AuthState = "loading" | "login" | "authenticated";

const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const euroCutover = new Date("2026-01-01T00:00:00Z");
const bgnToEur = 1.95583;

export default function Page() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [ticketStatus, setTicketStatus] = useState<"all" | "open" | "pending" | "closed">("all");
  const [showOverview, setShowOverview] = useState(false);

  const forceLogout = useCallback(() => {
    setAuthState("login");
    setUser(null);
    setTickets([]);
    setTransactions([]);
    setCards([]);
    setShowOverview(false);
    setError(null);
    setQuery("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkDashboardSession();
      if (!cancelled) setAuthState(ok ? "authenticated" : "login");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    const result = await loginDashboard(loginEmail, loginPassword);
    setLoginLoading(false);
    if (!result.ok) {
      setLoginError(result.error ?? "Login failed");
      return;
    }
    setAuthState("authenticated");
  }

  async function handleLogout() {
    await logoutDashboard();
    forceLogout();
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() || authState !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      const lookupUrl = `/api/users/lookup?query=${encodeURIComponent(query.trim())}`;
      const res = await apiFetch(lookupUrl);
      if (handleUnauthorized(forceLogout, res)) return;
      if (!res.ok) throw new Error("Request failed");
      const body = await res.json();
      if (!body.user) throw new Error("User not found");
      setUser(body.user);
      await loadTickets(body.user.id);
      await loadTransactions(body.user.id);
      await loadCards(body.user.id);
      setShowOverview(true);
    } catch {
      setError("Unable to load that user. Verify the query and sign-in.");
      setUser(null);
      setTickets([]);
      setTransactions([]);
      setCards([]);
      setShowOverview(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadTickets(userId: string) {
    const url = `/api/tickets?userId=${encodeURIComponent(userId)}`;
    const res = await apiFetch(url);
    if (handleUnauthorized(forceLogout, res)) return;
    if (!res.ok) {
      setTickets([]);
      return;
    }
    const body = await res.json();
    setTickets(body.tickets ?? []);
  }

  async function loadTransactions(userId: string) {
    const url = `/api/transactions?userId=${encodeURIComponent(userId)}`;
    const res = await apiFetch(url);
    if (handleUnauthorized(forceLogout, res)) return;
    if (!res.ok) {
      setTransactions([]);
      return;
    }
    const body = await res.json();
    const mapped: TransactionItem[] = (body.transactions ?? []).map((tx: Record<string, unknown>) => {
      const amount = typeof tx.amount === "number" ? tx.amount : Number(tx.amount ?? 0);
      return {
        id: String(tx.id),
        title: String(tx.category ?? "Transaction"),
        amount,
        date: String(tx.created_at ?? tx.date ?? new Date().toISOString()),
        type: amount >= 0 ? "credit" : "debit",
        category: tx.category ? String(tx.category) : undefined,
      };
    });
    setTransactions(mapped);
  }

  async function loadCards(userId: string) {
    const url = `/api/cards?userId=${encodeURIComponent(userId)}`;
    const res = await apiFetch(url);
    if (handleUnauthorized(forceLogout, res)) return;
    if (!res.ok) {
      setCards([]);
      return;
    }
    const body = await res.json();
    const mapped: CardItem[] = (body.cards ?? []).map((card: Record<string, unknown>) => ({
      id: String(card.id),
      name: String(card.nickname || "Card"),
      balance: typeof card.balance === "number" ? card.balance : 0,
      limit: typeof card.card_limit === "number" ? card.card_limit : 0,
      tags: Array.isArray(card.tags) ? (card.tags as string[]) : undefined,
    }));
    setCards(mapped);
  }

  if (authState === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-300">
        <p className="text-sm">Checking session…</p>
      </main>
    );
  }

  if (authState === "login") {
    return (
      <main className="relative overflow-hidden min-h-screen">
        <div className="grid-overlay" />
        <div className="max-w-md mx-auto px-6 py-24 relative z-10 fade-in">
          <div className="card-surface rounded-3xl p-8 space-y-6">
            <div className="space-y-2 text-center">
              <div className="pill inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-200 mx-auto">
                <ShieldCheck className="h-4 w-4 text-lime-300" />
                Support access only
              </div>
              <h1 className="text-2xl font-semibold font-display">TrackIt control deck</h1>
              <p className="text-sm text-slate-400">Sign in to view user data and tickets.</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="email"
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="Support email"
                required
                className="w-full rounded-2xl bg-white/5 border border-white/15 px-4 py-3 text-sm outline-none focus:border-cyan-300/60"
              />
              <input
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full rounded-2xl bg-white/5 border border-white/15 px-4 py-3 text-sm outline-none focus:border-cyan-300/60"
              />
              {loginError && <p className="text-sm text-rose-300">{loginError}</p>}
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-sky-400 text-slate-900 font-semibold px-4 py-3 text-sm disabled:opacity-60"
              >
                {loginLoading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative overflow-hidden min-h-screen">
      <div className="grid-overlay" />
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10 relative z-10 fade-in">
        <header className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between slide-up">
          <div className="space-y-4">
            <div className="pill inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-200 glow-hover">
              <Zap className="h-4 w-4 text-lime-300" />
              Finance cockpit for TrackIt app
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-semibold font-display tracking-tight">
                TrackIt control deck
              </h1>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-300">
              <span className="pill px-3 py-1">Ticket Support</span>
              <span className="pill px-3 py-1">User Lookup</span>
              <span className="pill px-3 py-1">Tracker</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="self-start pill px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            Logout
          </button>
        </header>

        <section className="card-surface rounded-3xl p-6 slide-up">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">User lookup</p>
              <p className="text-lg font-semibold">Search by email or ID</p>
            </div>
            <Users className="h-6 w-6 text-sky-300" />
          </div>
          <form onSubmit={handleSearch} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="user@swiftbank.app or UUID"
              className="w-full rounded-2xl bg-white/5 border border-white/15 px-4 py-3 text-sm outline-none focus:border-cyan-300/60 focus:bg-white/10"
            />
            <button
              type="submit"
              disabled={loading}
              className="min-w-[140px] rounded-2xl bg-gradient-to-r from-cyan-300 to-sky-400 text-slate-900 font-semibold px-4 py-3 text-sm shadow-lg shadow-cyan-500/30 disabled:opacity-60 glow-hover"
            >
              {loading ? "Searching..." : "Find user"}
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          {!user && !error && (
            <p className="mt-3 text-sm text-slate-400">Start with a user search to load profile and tickets.</p>
          )}
        </section>

        <section className="card-surface rounded-3xl p-6 slide-up">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Support tickets</p>
              <p className="text-lg font-semibold">User conversations</p>
            </div>
            <Ticket className="h-6 w-6 text-lime-300" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {(["all", "open", "pending", "closed"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setTicketStatus(status)}
                className={`pill px-3 py-2 capitalize ${
                  ticketStatus === status ? "bg-white/10 border-white/30" : "bg-white/5 border-white/10"
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {filterTickets(tickets, ticketStatus).length ? (
              filterTickets(tickets, ticketStatus).map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-2xl bg-slate/50 border border-white/5 px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{ticket.subject}</p>
                    <p className="text-xs text-slate-400">
                      {ticket.status.toUpperCase()} • Updated {formatRelative(ticket.updatedAt)}
                    </p>
                  </div>
                  <span className="pill px-3 py-1 text-xs capitalize">
                    {ticket.priority ? `${ticket.priority} • ${ticket.status}` : ticket.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-400">No tickets found.</div>
            )}
          </div>
        </section>

        {showOverview && user && (
          <div className="backdrop" onClick={() => setShowOverview(false)}>
            <div className="alert-card slide-up" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-slate-400">Account snapshot</p>
                  <p className="text-lg font-semibold">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOverview(false)}
                  className="pill px-3 py-1 text-xs font-semibold text-slate-100"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-300">Cards</p>
                    <Users className="h-5 w-5 text-sky-300" />
                  </div>
                  <div className="mt-3 space-y-2">
                    {cards.length ? (
                      cards.map((card) => (
                        <div key={card.id} className="flex items-center justify-between">
                          <p className="font-semibold text-slate-100">{card.name}</p>
                          {card.balance != null && (
                            <p className="text-sm text-slate-100">€{formatEuro(card.balance)}</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">No cards available.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-300">All activity</p>
                    <ShieldCheck className="h-5 w-5 text-amber-300" />
                  </div>
                  <div className="mt-3 space-y-2 max-h-52 overflow-y-auto pr-1">
                    {transactions.length ? (
                      transactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-100">{tx.title}</p>
                            <p className="text-xs text-slate-400">
                              {tx.category ? `${tx.category} • ` : ""}
                              {formatShortDate(tx.date)}
                            </p>
                          </div>
                          <span
                            className={`font-semibold ${tx.type === "credit" ? "text-lime-300" : "text-rose-300"}`}
                          >
                            {tx.type === "credit" ? "+" : "-"}€{formatEuro(tx.amount)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">No recent activity yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function filterTickets(tickets: TicketItem[], status: "all" | "open" | "pending" | "closed") {
  if (status === "all") return tickets;
  return tickets.filter((ticket) => ticket.status === status);
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "n/a";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 120) return `${minutes} min ago`;
  if (hours < 48) return `${hours} h ago`;
  if (days < 14) return `${days} days ago`;
  return dateLabel.format(date);
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "n/a";
  try {
    return dateLabel.format(date);
  } catch {
    return "n/a";
  }
}

function formatEuro(amount: number) {
  const useConversion = new Date() < euroCutover;
  const value = useConversion ? amount / bgnToEur : amount;
  return Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
