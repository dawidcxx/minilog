import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { NotificationAlert, NotificationTransport } from "../types";
import { AutocompleteSelect } from "./AutocompleteSelect";
import { Card } from "./Card";

type TransportDestinationType = "direct_message" | "guild_text_channel";

type TransportFormState = {
  id: number | null;
  name: string;
  destinationType: TransportDestinationType;
  destinationLabel: string;
  dmUserID: string;
  guildID: string;
  channelID: string;
  botToken: string;
  enabled: boolean;
};

type AlertFormState = {
  id: number | null;
  name: string;
  transportID: string;
  service: string;
  level: string;
  resourceID: string;
  message: string;
  enabled: boolean;
};

const EMPTY_TRANSPORT_FORM: TransportFormState = {
  id: null,
  name: "",
  destinationType: "direct_message",
  destinationLabel: "",
  dmUserID: "",
  guildID: "",
  channelID: "",
  botToken: "",
  enabled: true,
};

const EMPTY_ALERT_FORM: AlertFormState = {
  id: null,
  name: "",
  transportID: "",
  service: "",
  level: "",
  resourceID: "",
  message: "",
  enabled: true,
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function shortText(value: string, max = 72): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function destinationSummary(entry: NotificationTransport): string {
  if (entry.destination_type === "direct_message") {
    return `DM: ${entry.dm_user_id ?? "-"}`;
  }
  return `Guild: ${entry.guild_id ?? "-"} / Channel: ${entry.channel_id ?? "-"}`;
}

function buildAlertMatchQuery(filters: { service: string; level: string; resourceID: string }): string {
  const normalized = {
    service: filters.service.trim(),
    level: filters.level.trim(),
    resource_id: filters.resourceID.trim(),
  };

  const payload: Record<string, string> = {};
  if (normalized.service) payload.service = normalized.service;
  if (normalized.level) payload.level = normalized.level;
  if (normalized.resource_id) payload.resource_id = normalized.resource_id;

  return JSON.stringify(payload);
}

function parseAlertMatchQuery(raw: string): { service: string; level: string; resourceID: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { service: "", level: "", resourceID: "" };
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const resourceValue = parsed.resource_id;

    return {
      service: typeof parsed.service === "string" ? parsed.service : "",
      level: typeof parsed.level === "string" ? parsed.level : "",
      resourceID: typeof resourceValue === "string" ? resourceValue : "",
    };
  } catch {
    return { service: "", level: "", resourceID: "" };
  }
}

function summarizeMatchQuery(raw: string): string {
  const parsed = parseAlertMatchQuery(raw);
  const chunks: string[] = [];

  if (parsed.service) chunks.push(`service=${parsed.service}`);
  if (parsed.level) chunks.push(`level=${parsed.level}`);
  if (parsed.resourceID) chunks.push(`resource_id=${parsed.resourceID}`);

  if (chunks.length === 0) {
    return raw;
  }

  return chunks.join(" • ");
}

export function NotificationsManagement() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [transports, setTransports] = useState<NotificationTransport[]>([]);
  const [alerts, setAlerts] = useState<NotificationAlert[]>([]);
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [levelOptions, setLevelOptions] = useState<string[]>([]);

  const [transportForm, setTransportForm] = useState<TransportFormState>(EMPTY_TRANSPORT_FORM);
  const [transportSaving, setTransportSaving] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);

  const [alertForm, setAlertForm] = useState<AlertFormState>(EMPTY_ALERT_FORM);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  const canSubmitAlert = useMemo(() => transports.length > 0, [transports.length]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [loadedTransports, loadedAlerts, loadedFilterValues] = await Promise.all([
        api.getNotificationTransports(),
        api.getNotificationAlerts(),
        api.getLogsFilterValues(),
      ]);
      setTransports(loadedTransports);
      setAlerts(loadedAlerts);
      setServiceOptions(loadedFilterValues.service);
      setLevelOptions(loadedFilterValues.level);

      setAlertForm((prev) => {
        if (prev.transportID || loadedTransports.length === 0) return prev;
        return { ...prev, transportID: String(loadedTransports[0].id) };
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "failed to load notifications settings");
      setServiceOptions([]);
      setLevelOptions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function resetTransportForm() {
    setTransportForm(EMPTY_TRANSPORT_FORM);
    setTransportError(null);
  }

  function resetAlertForm() {
    setAlertForm((prev) => ({
      ...EMPTY_ALERT_FORM,
      transportID: transports.length > 0 ? String(transports[0].id) : prev.transportID,
    }));
    setAlertError(null);
  }

  function startEditTransport(entry: NotificationTransport) {
    setTransportForm({
      id: entry.id,
      name: entry.name,
      destinationType: entry.destination_type,
      destinationLabel: entry.destination_label ?? "",
      dmUserID: entry.dm_user_id ?? "",
      guildID: entry.guild_id ?? "",
      channelID: entry.channel_id ?? "",
      botToken: "",
      enabled: entry.enabled,
    });
    setTransportError(null);
  }

  function startEditAlert(entry: NotificationAlert) {
    const parsedQuery = parseAlertMatchQuery(entry.match_query);

    setAlertForm({
      id: entry.id,
      name: entry.name,
      transportID: String(entry.transport_id),
      service: parsedQuery.service,
      level: parsedQuery.level,
      resourceID: parsedQuery.resourceID,
      message: entry.message,
      enabled: entry.enabled,
    });
    setAlertError(null);
  }

  async function onSaveTransport(event: React.FormEvent) {
    event.preventDefault();
    setTransportSaving(true);
    setTransportError(null);

    try {
      const payload = {
        name: transportForm.name,
        destination_type: transportForm.destinationType,
        destination_label: transportForm.destinationLabel,
        dm_user_id: transportForm.dmUserID,
        guild_id: transportForm.guildID,
        channel_id: transportForm.channelID,
        bot_token: transportForm.botToken,
        enabled: transportForm.enabled,
      };

      const nextTransports =
        transportForm.id === null
          ? await api.createNotificationTransport(payload)
          : await api.updateNotificationTransport(transportForm.id, payload);

      setTransports(nextTransports);
      resetTransportForm();

      setAlertForm((prev) => {
        if (prev.transportID || nextTransports.length === 0) return prev;
        return { ...prev, transportID: String(nextTransports[0].id) };
      });
    } catch (err: unknown) {
      setTransportError(err instanceof Error ? err.message : "failed to save transport");
    } finally {
      setTransportSaving(false);
    }
  }

  async function onSaveAlert(event: React.FormEvent) {
    event.preventDefault();
    setAlertSaving(true);
    setAlertError(null);

    try {
      const transportID = Number(alertForm.transportID);
      if (!Number.isFinite(transportID) || transportID <= 0) {
        setAlertError("select a valid transport first");
        setAlertSaving(false);
        return;
      }

      const hasAnyMatchFilter =
        alertForm.service.trim() !== "" || alertForm.level.trim() !== "" || alertForm.resourceID.trim() !== "";
      if (!hasAnyMatchFilter) {
        setAlertError("set at least one match filter: service, level or resource ID");
        setAlertSaving(false);
        return;
      }

      const payload = {
        name: alertForm.name,
        transport_id: transportID,
        match_query: buildAlertMatchQuery({
          service: alertForm.service,
          level: alertForm.level,
          resourceID: alertForm.resourceID,
        }),
        message: alertForm.message,
        enabled: alertForm.enabled,
      };

      const nextAlerts =
        alertForm.id === null ? await api.createNotificationAlert(payload) : await api.updateNotificationAlert(alertForm.id, payload);

      setAlerts(nextAlerts);
      resetAlertForm();
    } catch (err: unknown) {
      setAlertError(err instanceof Error ? err.message : "failed to save alert");
    } finally {
      setAlertSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Notification transports">
        {error && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-300">{error}</p>}
        {loading && <p className="mb-3 text-sm text-zinc-400">Loading notification settings...</p>}

        <form className="space-y-3" onSubmit={onSaveTransport}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-zinc-300">
              Transport name
              <input
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                required
                placeholder="discord message to johnny"
                value={transportForm.name}
                onInput={(event) => setTransportForm((prev) => ({ ...prev, name: (event.target as HTMLInputElement).value }))}
              />
            </label>

            <label className="text-sm text-zinc-300">
              Provider
              <input
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-zinc-400"
                value="discord_assistant"
                disabled
              />
            </label>

            <label className="text-sm text-zinc-300">
              Destination type
              <select
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                value={transportForm.destinationType}
                onChange={(event) =>
                  setTransportForm((prev) => ({ ...prev, destinationType: (event.target as HTMLSelectElement).value as TransportDestinationType }))
                }
              >
                <option value="direct_message">Direct message</option>
                <option value="guild_text_channel">Guild + text channel</option>
              </select>
            </label>

            <label className="text-sm text-zinc-300">
              Destination label (optional)
              <input
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                placeholder="johnny"
                value={transportForm.destinationLabel}
                onInput={(event) => setTransportForm((prev) => ({ ...prev, destinationLabel: (event.target as HTMLInputElement).value }))}
              />
            </label>

            {transportForm.destinationType === "direct_message" ? (
              <label className="text-sm text-zinc-300 md:col-span-2">
                Direct message user id
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                  required
                  placeholder="123456789012345678"
                  value={transportForm.dmUserID}
                  onInput={(event) => setTransportForm((prev) => ({ ...prev, dmUserID: (event.target as HTMLInputElement).value }))}
                />
              </label>
            ) : (
              <>
                <label className="text-sm text-zinc-300">
                  Guild id
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                    required
                    placeholder="987654321098765432"
                    value={transportForm.guildID}
                    onInput={(event) => setTransportForm((prev) => ({ ...prev, guildID: (event.target as HTMLInputElement).value }))}
                  />
                </label>

                <label className="text-sm text-zinc-300">
                  Text channel id
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                    required
                    placeholder="123123123123123123"
                    value={transportForm.channelID}
                    onInput={(event) => setTransportForm((prev) => ({ ...prev, channelID: (event.target as HTMLInputElement).value }))}
                  />
                </label>
              </>
            )}

            <label className="text-sm text-zinc-300 md:col-span-2">
              Bot token {transportForm.id !== null && "(leave blank to keep current token)"}
              <input
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                type="password"
                required={transportForm.id === null}
                placeholder={transportForm.id === null ? "discord bot token" : "keep existing token"}
                value={transportForm.botToken}
                onInput={(event) => setTransportForm((prev) => ({ ...prev, botToken: (event.target as HTMLInputElement).value }))}
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={transportForm.enabled}
                onChange={(event) => setTransportForm((prev) => ({ ...prev, enabled: (event.target as HTMLInputElement).checked }))}
              />
              Enabled
            </label>
          </div>

          {transportError && <p className="text-sm text-rose-400">{transportError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg bg-linear-to-r from-sky-600 to-cyan-600 px-4 py-2.5 font-medium text-white transition hover:from-sky-500 hover:to-cyan-500 disabled:opacity-50"
              type="submit"
              disabled={transportSaving}
            >
              {transportSaving ? "Saving..." : transportForm.id === null ? "Add transport" : "Update transport"}
            </button>
            {transportForm.id !== null && (
              <button
                className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-zinc-800"
                type="button"
                onClick={resetTransportForm}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>

        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full table-fixed text-left text-sm">
            <thead className="bg-zinc-950/80">
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="w-12 px-3 py-2">#</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Destination</th>
                <th className="px-3 py-2">Token</th>
                <th className="w-28 px-3 py-2">Enabled</th>
                <th className="w-48 px-3 py-2">Updated</th>
                <th className="w-24 px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && transports.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-zinc-400" colSpan={7}>
                    No transports configured.
                  </td>
                </tr>
              )}

              {transports.map((entry) => (
                <tr className="border-b border-zinc-900/80" key={entry.id}>
                  <td className="px-3 py-2 text-zinc-400">{entry.id}</td>
                  <td className="px-3 py-2 text-zinc-100">{entry.name}</td>
                  <td className="px-3 py-2 text-zinc-300">
                    <p>{destinationSummary(entry)}</p>
                    {entry.destination_label && <p className="text-xs text-zinc-500">label: {entry.destination_label}</p>}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{entry.bot_token_masked ?? "-"}</td>
                  <td className="px-3 py-2 text-zinc-300">{entry.enabled ? "yes" : "no"}</td>
                  <td className="px-3 py-2 text-zinc-300">{formatDateTime(entry.updated_at)}</td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                      type="button"
                      onClick={() => startEditTransport(entry)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Alerts">
        <form className="space-y-3" onSubmit={onSaveAlert}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-zinc-300">
              Alert name
              <input
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                required
                placeholder="Error spike on API"
                value={alertForm.name}
                onInput={(event) => setAlertForm((prev) => ({ ...prev, name: (event.target as HTMLInputElement).value }))}
              />
            </label>

            <label className="text-sm text-zinc-300">
              Transport
              <select
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                required
                disabled={!canSubmitAlert}
                value={alertForm.transportID}
                onChange={(event) => setAlertForm((prev) => ({ ...prev, transportID: (event.target as HTMLSelectElement).value }))}
              >
                {!canSubmitAlert && <option value="">Create a transport first</option>}
                {transports.map((entry) => (
                  <option key={entry.id} value={String(entry.id)}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-zinc-300">
              Service filter
              <AutocompleteSelect
                options={serviceOptions}
                value={alertForm.service}
                onChange={(value) => setAlertForm((prev) => ({ ...prev, service: value }))}
                placeholder="api"
              />
            </label>

            <label className="text-sm text-zinc-300">
              Level filter
              <AutocompleteSelect
                options={levelOptions}
                value={alertForm.level}
                onChange={(value) => setAlertForm((prev) => ({ ...prev, level: value }))}
                placeholder="error"
              />
            </label>

            <label className="text-sm text-zinc-300 md:col-span-2">
              Resource ID filter
              <input
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                placeholder="resource_abc"
                value={alertForm.resourceID}
                onInput={(event) => setAlertForm((prev) => ({ ...prev, resourceID: (event.target as HTMLInputElement).value }))}
              />
            </label>

            <label className="text-sm text-zinc-300 md:col-span-2">
              Notification message
              <textarea
                className="mt-1 min-h-28 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
                required
                placeholder="Describe what happened and what the on-call should check."
                value={alertForm.message}
                onInput={(event) => setAlertForm((prev) => ({ ...prev, message: (event.target as HTMLTextAreaElement).value }))}
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={alertForm.enabled}
                onChange={(event) => setAlertForm((prev) => ({ ...prev, enabled: (event.target as HTMLInputElement).checked }))}
              />
              Enabled
            </label>
          </div>

          {alertError && <p className="text-sm text-rose-400">{alertError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg bg-linear-to-r from-sky-600 to-cyan-600 px-4 py-2.5 font-medium text-white transition hover:from-sky-500 hover:to-cyan-500 disabled:opacity-50"
              type="submit"
              disabled={alertSaving || !canSubmitAlert}
            >
              {alertSaving ? "Saving..." : alertForm.id === null ? "Add alert" : "Update alert"}
            </button>
            {alertForm.id !== null && (
              <button
                className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-zinc-800"
                type="button"
                onClick={resetAlertForm}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>

        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full table-fixed text-left text-sm">
            <thead className="bg-zinc-950/80">
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="w-12 px-3 py-2">#</th>
                <th className="w-44 px-3 py-2">Name</th>
                <th className="w-44 px-3 py-2">Transport</th>
                <th className="px-3 py-2">Match filters</th>
                <th className="px-3 py-2">Message</th>
                <th className="w-24 px-3 py-2">Enabled</th>
                <th className="w-24 px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && alerts.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-zinc-400" colSpan={7}>
                    No alerts configured.
                  </td>
                </tr>
              )}

              {alerts.map((entry) => (
                <tr className="border-b border-zinc-900/80" key={entry.id}>
                  <td className="px-3 py-2 text-zinc-400">{entry.id}</td>
                  <td className="px-3 py-2 text-zinc-100">{entry.name}</td>
                  <td className="px-3 py-2 text-zinc-300">{entry.transport_name}</td>
                  <td className="px-3 py-2 text-zinc-300" title={entry.match_query}>
                    {shortText(summarizeMatchQuery(entry.match_query), 72)}
                  </td>
                  <td className="px-3 py-2 text-zinc-300" title={entry.message}>
                    {shortText(entry.message, 72)}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{entry.enabled ? "yes" : "no"}</td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                      type="button"
                      onClick={() => startEditAlert(entry)}
                    >
                      Edit
                    </button>
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
