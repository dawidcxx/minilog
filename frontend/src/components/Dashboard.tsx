import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../context/AppStateContext";
import { api } from "../lib/api";
import type { ServiceLog } from "../types";
import { AutocompleteSelect } from "./AutocompleteSelect";
import { Card } from "./Card";

type Filters = {
  service: string;
  level: string;
  requestID: string;
  resourceID: string;
  limit: number;
};

const DEFAULT_FILTERS: Filters = {
  service: "",
  level: "",
  requestID: "",
  resourceID: "",
  limit: 100,
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatMessage(entry: ServiceLog): string {
  if (entry.message_json) return JSON.stringify(entry.message_json);
  if (entry.message) return entry.message;
  return "";
}

function formatExpandedMessage(entry: ServiceLog): string {
  if (entry.message_json) {
    try {
      return JSON.stringify(entry.message_json, null, 2);
    } catch {
      return JSON.stringify(entry.message_json);
    }
  }
  if (entry.message) return entry.message;
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

export function Dashboard(props: { onLogout: () => Promise<void> }) {
  const { user } = useAppState();

  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [levelOptions, setLevelOptions] = useState<string[]>([]);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.service) params.set("service", filters.service);
    if (filters.level) params.set("level", filters.level);
    if (filters.requestID) params.set("request_id", filters.requestID);
    if (filters.resourceID) params.set("resource_id", filters.resourceID);
    params.set("limit", String(filters.limit));
    return params.toString();
  }, [filters]);

  async function fetchLogs(isManual = false) {
    if (isManual) setRefreshing(true);
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLogs({
        service: filters.service,
        level: filters.level,
        request_id: filters.requestID,
        resource_id: filters.resourceID,
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const values = await api.getLogsFilterValues();
        if (!cancelled) {
          setServiceOptions(values.service);
          setLevelOptions(values.level);
        }
      } catch {
        if (!cancelled) {
          setServiceOptions([]);
          setLevelOptions([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4 backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-400">Signed in as</p>
          <p className="text-sm font-medium text-zinc-100">{user.email}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
            onClick={() => props.onLogout()}
          >
            Logout
          </button>
        </div>
      </div>

      <div className="relative z-20">
        <Card title="Filters">
          <div className="grid gap-3 md:grid-cols-5">
          <label className="text-xs text-zinc-400">
            Service
            <AutocompleteSelect
              options={serviceOptions}
              value={filters.service}
              onChange={(value) => setFilter("service", value)}
              placeholder="api"
            />
          </label>

          <label className="text-xs text-zinc-400">
            Level
            <AutocompleteSelect
              options={levelOptions}
              value={filters.level}
              onChange={(value) => setFilter("level", value)}
              placeholder="error"
            />
          </label>

          <label className="text-xs text-zinc-400">
            Request ID
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-sky-500"
              placeholder="req_123"
              value={filters.requestID}
              onInput={(e) => setFilter("requestID", (e.target as HTMLInputElement).value)}
            />
          </label>

          <label className="text-xs text-zinc-400">
            Resource ID
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-sky-500"
              placeholder="resource_abc"
              value={filters.resourceID}
              onInput={(e) => setFilter("resourceID", (e.target as HTMLInputElement).value)}
            />
          </label>

          <label className="text-xs text-zinc-400">
            Limit
            <select
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-sky-500"
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

          <div className="mt-3 flex justify-end">
            <button
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 transition hover:bg-zinc-800"
              onClick={resetFilters}
            >
              Reset filters
            </button>
          </div>
        </Card>
      </div>

      <div className="relative z-0">
        <Card title="Service Logs">
        {error && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-300">{error}</p>}
        {loading && <p className="mb-3 text-sm text-zinc-400">Loading logs...</p>}

        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full table-fixed text-left text-sm">
            <thead className="bg-zinc-950/80">
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="w-40 px-3 py-2">timestamp</th>
                <th className="w-40 px-3 py-2">service</th>
                <th className="w-24 px-3 py-2">level</th>
                <th className="w-44 px-3 py-2">resource_id</th>
                <th className="min-w-104 px-3 py-2">message</th>
                <th className="w-72 px-3 py-2">request_id</th>
                <th className="w-36 px-3 py-2">host</th>
              </tr>
            </thead>
            <tbody>
              {!loading && logs.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-zinc-400" colSpan={7}>
                    No logs found for the current filters.
                  </td>
                </tr>
              )}

              {logs.map((entry, index) => {
                const rowKey = `${entry.timestamp}-${entry.service}-${entry.hostname}-${entry.request_id ?? ""}-${index}`;
                const isExpanded = expandedRowKey === rowKey;
                const message = formatMessage(entry);
                const expandedMessage = formatExpandedMessage(entry);

                return (
                  <>
                    <tr
                      className="cursor-pointer border-b border-zinc-900/80 align-top hover:bg-zinc-800/30"
                      key={rowKey}
                      onClick={() => setExpandedRowKey((prev) => (prev === rowKey ? null : rowKey))}
                    >
                      <td className="truncate whitespace-nowrap px-3 py-2 text-zinc-300" title={formatTimestamp(entry.timestamp)}>
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="truncate px-3 py-2 text-zinc-100" title={entry.service}>
                        {entry.service}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${levelClassName(entry.level)}`}>
                          {entry.level}
                        </span>
                      </td>
                      <td className="truncate whitespace-nowrap px-3 py-2 text-zinc-300" title={entry.resource_id ?? "-"}>
                        {entry.resource_id ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        <div className="truncate" title={message}>
                          {message || "-"}
                        </div>
                      </td>
                      <td className="truncate whitespace-nowrap px-3 py-2 text-zinc-300" title={entry.request_id ?? "-"}>
                        {entry.request_id ?? "-"}
                      </td>
                      <td className="truncate px-3 py-2 text-zinc-300" title={entry.hostname}>
                        {entry.hostname}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="border-b border-zinc-900/80 bg-zinc-950/40" key={`${rowKey}-expanded`}>
                        <td className="px-3 pb-4 pt-2 text-xs text-zinc-300" colSpan={7}>
                          <p className="mb-2 text-zinc-400">Full message</p>
                          <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-200">
                            {expandedMessage || "-"}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        </Card>
      </div>
    </div>
  );
}
