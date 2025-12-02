"use client";

import { ShieldCheck, Ticket, Users, Zap } from "lucide-react";
import { useState } from "react";

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

const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const apiBase = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

export default function Page() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [ticketStatus, setTicketStatus] = useState<"all" | "open" | "pending" | "closed">("all");

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const base = apiBase;
      const lookupUrl = `${base}/api/users/lookup?query=${encodeURIComponent(query.trim())}`;
      const res = await fetch(lookupUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("Request failed");
      const body = await res.json();
      if (!body.user) throw new Error("User not found");
      setUser(body.user);
      await loadTickets(body.user.id);
    } catch (err) {
      setError("Unable to load that user. Verify the query and API endpoint.");
      setUser(null);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTickets(userId: string) {
    try {
      const base = apiBase;
      const url = `${base}/api/tickets?userId=${encodeURIComponent(userId)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Tickets request failed");
      const body = await res.json();
      setTickets(body.tickets ?? []);
    } catch (err) {
      setTickets([]);
    }
  }

  return (
    <main className="relative overflow-hidden">
      <div className="grid-overlay" />
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10 relative">
        <header className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="pill inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-200">
              <Zap className="h-4 w-4 text-lime-300" />
              Finance cockpit for Swift app
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-semibold font-display tracking-tight">
                TrackIt control deck
              </h1>
              <p className="text-slate-300 max-w-2xl leading-relaxed">
                Modern dashboard shell ready to wire into your Spring Boot APIs and Neon once the backend is ready.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-300">
              <span className="pill px-3 py-1">Support ops</span>
              <span className="pill px-3 py-1">Spring ready</span>
              <span className="pill px-3 py-1">Swift handoff</span>
            </div>
          </div>
        </header>

        <section className="card-surface rounded-3xl p-6 shadow-glow">
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
              className="w-full rounded-2xl bg-slate/50 border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/30"
            />
            <button
              type="submit"
              disabled={loading}
              className="min-w-[140px] rounded-2xl bg-gradient-to-r from-lime-300 to-teal-400 text-ink font-semibold px-4 py-3 text-sm disabled:opacity-60"
            >
              {loading ? "Searching..." : "Find user"}
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          {!user && !error && <p className="mt-3 text-sm text-slate-400">Start with a user search to load profile and tickets.</p>}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card-surface rounded-3xl p-6 shadow-glow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Selected user</p>
                <p className="text-lg font-semibold">Profile</p>
              </div>
              <ShieldCheck className="h-6 w-6 text-amber-300" />
            </div>
            <div className="mt-4 space-y-3">
              {user ? (
                <div className="rounded-2xl bg-slate/50 border border-white/5 px-3 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                    <span className="pill px-3 py-1 text-xs uppercase tracking-wide">User</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300">
                    <div>
                      <p className="text-xs text-slate-500">User ID</p>
                      <p className="font-medium break-all">{user.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Last active</p>
                      <p className="font-medium">{formatRelative(user.lastActive)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400">Search to load a user profile.</div>
              )}
            </div>
          </div>

          <div className="card-surface rounded-3xl p-6 lg:col-span-2 shadow-glow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Support tickets</p>
                <p className="text-lg font-semibold">User conversations</p>
              </div>
              <Ticket className="h-6 w-6 text-lime-300" />
            </div>

            <div className="mt-4 flex gap-2 text-sm">
              {(["all", "open", "pending", "closed"] as const).map((status) => (
                <button
                  key={status}
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
                <div className="text-sm text-slate-400">No tickets. Connect ticket API to populate this.</div>
              )}
            </div>
          </div>
        </section>
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
