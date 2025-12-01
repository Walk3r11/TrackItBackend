import { Sparkline } from "@/components/sparkline";
import { Activity, ArrowUpRight, ShieldCheck, Users, Wallet2, Zap } from "lucide-react";
import type { ReactNode } from "react";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const preciseCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const emptyData = {
  summary: {
    totalBalance: null as number | null,
    activeUsers: null as number | null,
    monthlyVolume: null as number | null,
    adminCount: null as number | null,
    users: null as number | null
  },
  monthly: [] as { label: string; value: number }[],
  admins: [] as { id: string; name: string; email: string; role: string }[],
  users: [] as { id: string; name: string; email: string; balance: number; monthlySpend: number; lastActive: string }[]
};

export default function Page() {
  const data = emptyData;
  const series = data.monthly;
  const latest = series.at(-1)?.value;
  const previous = series.at(-2)?.value;
  const growth = latest != null && previous ? ((latest - previous) / previous) * 100 : null;

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
              <span className="pill px-3 py-1">Static preview</span>
              <span className="pill px-3 py-1">Spring ready</span>
              <span className="pill px-3 py-1">Swift handoff</span>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            title="Assets under watch"
            value={data.summary.totalBalance != null ? currency.format(data.summary.totalBalance) : "Awaiting data"}
            hint="Connect balances API"
            icon={<Wallet2 className="h-5 w-5 text-lime-300" />}
          />
          <MetricCard
            title="Active this week"
            value={data.summary.activeUsers != null ? data.summary.activeUsers.toLocaleString() : "Awaiting data"}
            hint="Connect activity API"
            icon={<Activity className="h-5 w-5 text-emerald-300" />}
          />
          <MetricCard
            title="Monthly volume"
            value={data.summary.monthlyVolume != null ? currency.format(data.summary.monthlyVolume) : "Awaiting data"}
            hint={growth != null ? `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% vs prev` : "Connect volume API"}
            icon={<ArrowUpRight className="h-5 w-5 text-sky-300" />}
          />
          <MetricCard
            title="Dashboard admins"
            value={data.summary.adminCount != null ? data.summary.adminCount.toLocaleString() : "Awaiting data"}
            hint="Connect admin service"
            icon={<ShieldCheck className="h-5 w-5 text-amber-300" />}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card-surface rounded-3xl p-6 shadow-glow lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">Monthly spend trajectory</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-2xl font-semibold">
                    {latest != null ? currency.format(latest) : "Awaiting data"}
                  </span>
                  <span
                    className={`pill px-3 py-1 text-xs ${
                      growth != null
                        ? growth >= 0
                          ? "text-emerald-300 bg-emerald-500/10"
                          : "text-rose-300 bg-rose-500/10"
                        : "text-slate-300 bg-white/5"
                    }`}
                  >
                    {growth != null ? `${growth >= 0 ? "▲" : "▼"} ${growth.toFixed(1)}%` : "Awaiting data"}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400">Total users</p>
                <p className="text-lg font-semibold">
                  {data.summary.users != null ? data.summary.users.toLocaleString() : "Awaiting data"}
                </p>
              </div>
            </div>
            <div className="mt-6 h-48">
              {series.length ? (
                <Sparkline data={series} className="h-full w-full" />
              ) : (
                <div className="h-full rounded-2xl border border-dashed border-white/10 flex items-center justify-center text-sm text-slate-400">
                  Connect monthly series API to render this chart
                </div>
              )}
            </div>
            {series.length ? (
              <div className="mt-4 grid grid-cols-6 gap-2 text-xs text-slate-400">
                {series.map((point) => (
                  <div key={point.label} className="text-center">
                    {point.label}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="card-surface rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Admin roster</p>
                <p className="text-lg font-semibold">Access and roles</p>
              </div>
              <ShieldCheck className="h-6 w-6 text-amber-300" />
            </div>
            <div className="mt-4 space-y-3">
              {data.admins.length ? (
                data.admins.map((admin) => (
                  <div key={admin.id} className="flex items-center justify-between rounded-2xl bg-slate/50 border border-white/5 px-3 py-3">
                    <div>
                      <p className="font-medium">{admin.name}</p>
                      <p className="text-xs text-slate-400">{admin.email}</p>
                    </div>
                    <span className="pill px-3 py-1 text-xs uppercase tracking-wide">{admin.role}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400">Connect admin service to list access holders.</div>
              )}
            </div>
          </div>
        </section>

        <section className="card-surface rounded-3xl p-6 shadow-glow">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Recent users</p>
              <p className="text-lg font-semibold">Swift app identities</p>
            </div>
            <Users className="h-6 w-6 text-sky-300" />
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/5">
            {data.users.length ? (
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-slate-300 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">User</th>
                    <th className="px-4 py-3 text-left font-medium">Balance</th>
                    <th className="px-4 py-3 text-left font-medium">Monthly spend</th>
                    <th className="px-4 py-3 text-left font-medium">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.users.map((user) => (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-sm font-semibold">
                            {user.name
                              .split(" ")
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-slate-400">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{preciseCurrency.format(user.balance)}</td>
                      <td className="px-4 py-3">{preciseCurrency.format(user.monthlySpend)}</td>
                      <td className="px-4 py-3 text-slate-300">{formatRelative(user.lastActive)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-6 text-slate-400 text-sm">Connect user API to populate this table.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon
}: {
  title: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="card-surface rounded-2xl p-5 shadow-glow">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{title}</p>
        <div className="pill px-3 py-2 text-xs flex items-center gap-2">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <p className="mt-1 text-sm text-slate-400">{hint}</p>
    </div>
  );
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
