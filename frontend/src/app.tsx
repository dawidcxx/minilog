import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { Route, Router } from "wouter";
import { api } from "./lib/api";
import type { BootState, ServiceLog, User } from "./types";

type Filters = {
  service: string;
  level: string;
  query: string;
  limit: number;
};

const DEFAULT_FILTERS: Filters = {
  service: "",
  level: "",
  query: "",
  limit: 100,
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatMessage(entry: ServiceLog): string {
  if (entry.message) return entry.message;
  if (entry.message_json) return JSON.stringify(entry.message_json);
  return "";
}

function normalizeLevel(level: string): string {
  return level.trim().toLowerCase();
}

function levelClassName(level: string): string {
  const normalized = normalizeLevel(level);
  if (["error", "fatal"].includes(normalized)) {
    return "border-rose-500/40 bg-rose-500/10 text-rose-300";
  }
  if (["warn", "warning"].includes(normalized)) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
  if (["info"].includes(normalized)) {
    return "border-sky-500/40 bg-sky-500/10 text-sky-300";
  }
  return "border-zinc-700 bg-zinc-800 text-zinc-200";
}

function Card(props: { title: string; children: ComponentChildren }) {
  return (
    <section class="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
      <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-300">{props.title}</h2>
      {props.children}
    </section>
  );
}

function Stat(props: { label: string; value: string | number }) {
  return (
    <div class="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
      <p class="text-xs uppercase tracking-wide text-zinc-400">{props.label}</p>
      <p class="mt-1 text-xl font-semibold text-zinc-100">{props.value}</p>
    </div>
  );
}

function AuthForm(props: {
  mode: "login" | "register";
  onDone: (user: User) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = props.mode === "register" ? "Create your admin account" : "Welcome back";
  const subtitle =
    props.mode === "register"
      ? "This account unlocks the dashboard. Single-user mode is enabled."
      : "Sign in to continue to the logs dashboard.";

  async function onSubmit(event: Event) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const nextUser =
        props.mode === "register"
          ? await api.register(email, password)
          : await api.login(email, password);
      props.onDone(nextUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to continue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title={props.mode === "register" ? "First run setup" : "Authentication"}>
      <h3 class="text-xl font-semibold text-zinc-100">{title}</h3>
      <p class="mb-5 mt-1 text-sm text-zinc-400">{subtitle}</p>

      <form class="space-y-3" onSubmit={onSubmit}>
        <label class="block text-sm text-zinc-300">
          Email
          <input
            class="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
            type="email"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            required
            placeholder="you@company.com"
          />
        </label>

        <label class="block text-sm text-zinc-300">
          Password
          <input
            class="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
            type="password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            required
            placeholder="••••••••"
          />
        </label>

        {error && <p class="text-sm text-rose-400">{error}</p>}

        <button
          class="w-full rounded-lg bg-gradient-to-r from-sky-600 to-cyan-600 px-4 py-2.5 font-medium text-white transition hover:from-sky-500 hover:to-cyan-500 disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? "Working..." : props.mode === "register" ? "Register" : "Login"}
        </button>
      </form>
    </Card>
  );
}

function Dashboard(props: { user: User; onLogout: () => Promise<void> }) {
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.service) params.set("service", filters.service);
    if (filters.level) params.set("level", filters.level);
    if (filters.query) params.set("q", filters.query);
    params.set("limit", String(filters.limit));
    return params.toString();
  }, [filters]);

  const stats = useMemo(() => {
    const services = new Set(logs.map((log) => log.service));
    const levels = new Set(logs.map((log) => normalizeLevel(log.level)));
    return {
      total: logs.length,
      services: services.size,
      levels: levels.size,
    };
  }, [logs]);

  async function fetchLogs(isManual = false) {
    if (isManual) setRefreshing(true);
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLogs({
        service: filters.service,
        level: filters.level,
        q: filters.query,
        limit: filters.limit,
      });
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load logs");
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, [query]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  return (
    <div class="space-y-5">
      <div class="grid gap-3 sm:grid-cols-3">
        <Stat label="Rows" value={stats.total} />
        <Stat label="Services" value={stats.services} />
        <Stat label="Levels" value={stats.levels} />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4 backdrop-blur">
        <div>
          <p class="text-xs uppercase tracking-wide text-zinc-400">Signed in as</p>
          <p class="text-sm font-medium text-zinc-100">{props.user.email}</p>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            class="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
            onClick={() => props.onLogout()}
          >
            Logout
          </button>
        </div>
      </div>

      <Card title="Filters">
        <div class="grid gap-3 md:grid-cols-5">
          <label class="text-xs text-zinc-400">
            Service
            <input
              class="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-sky-500"
              placeholder="api"
              value={filters.service}
              onInput={(e) => setFilter("service", (e.target as HTMLInputElement).value)}
            />
          </label>

          <label class="text-xs text-zinc-400">
            Level
            <input
              class="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-sky-500"
              placeholder="error"
              value={filters.level}
              onInput={(e) => setFilter("level", (e.target as HTMLInputElement).value)}
            />
          </label>

          <label class="text-xs text-zinc-400 md:col-span-2">
            Contains text
            <input
              class="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-sky-500"
              placeholder="timeout"
              value={filters.query}
              onInput={(e) => setFilter("query", (e.target as HTMLInputElement).value)}
            />
          </label>

          <label class="text-xs text-zinc-400">
            Limit
            <select
              class="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-sky-500"
              value={String(filters.limit)}
              onChange={(e) => setFilter("limit", Number((e.target as HTMLSelectElement).value))}
            >
              <option value="50">50 rows</option>
              <option value="100">100 rows</option>
              <option value="250">250 rows</option>
              <option value="500">500 rows</option>
            </select>
          </label>
        </div>

        <div class="mt-3 flex justify-end">
          <button
            class="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 transition hover:bg-zinc-800"
            onClick={resetFilters}
          >
            Reset filters
          </button>
        </div>
      </Card>

      <Card title="Service Logs">
        {error && <p class="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-300">{error}</p>}
        {loading && <p class="mb-3 text-sm text-zinc-400">Loading logs...</p>}

        <div class="overflow-x-auto rounded-xl border border-zinc-800">
          <table class="min-w-full text-left text-sm">
            <thead class="bg-zinc-950/80">
              <tr class="border-b border-zinc-800 text-zinc-400">
                <th class="px-3 py-2">timestamp</th>
                <th class="px-3 py-2">service</th>
                <th class="px-3 py-2">level</th>
                <th class="px-3 py-2">host</th>
                <th class="px-3 py-2">message</th>
              </tr>
            </thead>
            <tbody>
              {!loading && logs.length === 0 && (
                <tr>
                  <td class="px-3 py-8 text-center text-zinc-400" colSpan={5}>
                    No logs found for the current filters.
                  </td>
                </tr>
              )}

              {logs.map((entry) => (
                <tr class="border-b border-zinc-900/80 align-top hover:bg-zinc-800/30" key={`${entry.timestamp}-${entry.service}-${entry.hostname}-${entry.request_id ?? ""}`}>
                  <td class="whitespace-nowrap px-3 py-2 text-zinc-300">{formatTimestamp(entry.timestamp)}</td>
                  <td class="px-3 py-2 text-zinc-100">{entry.service}</td>
                  <td class="px-3 py-2">
                    <span class={`rounded-md border px-2 py-0.5 text-xs font-medium ${levelClassName(entry.level)}`}>
                      {entry.level}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-zinc-300">{entry.hostname}</td>
                  <td class="max-w-2xl px-3 py-2 text-zinc-300">
                    <div class="line-clamp-3 break-words">{formatMessage(entry)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AppBody() {
  const [boot, setBoot] = useState<BootState | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const b = await api.bootstrap();
      setBoot(b);
      if (b.has_user) {
        try {
          const me = await api.me();
          setUser(me);
        } catch {
          setUser(null);
        }
      }
    })().catch((err: unknown) => {
      setBoot({ has_user: false });
      setBootError(err instanceof Error ? err.message : "failed to bootstrap app");
    });
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
  }

  if (!boot) {
    return <p class="text-zinc-300">Loading app state...</p>;
  }

  if (!boot.has_user) {
    return (
      <>
        {bootError && <p class="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">{bootError}</p>}
        <AuthForm
          mode="register"
          onDone={(u) => {
            setBoot({ has_user: true });
            setUser(u);
          }}
        />
      </>
    );
  }

  if (!user) {
    return <AuthForm mode="login" onDone={setUser} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}

export function App() {
  return (
    <Router>
      <main class="mx-auto min-h-screen max-w-6xl px-4 py-6 text-zinc-50">
        <header class="mb-5">
          <h1 class="bg-gradient-to-r from-cyan-300 to-sky-500 bg-clip-text text-3xl font-bold text-transparent">minilog</h1>
          <p class="mt-1 text-sm text-zinc-400">Lightweight PostgreSQL logs dashboard.</p>
        </header>

        <Route path="/">
          <AppBody />
        </Route>
      </main>
    </Router>
  );
}