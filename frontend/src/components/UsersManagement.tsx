import { Fragment, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ManagedUser } from "../types";
import { Card } from "./Card";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function UsersManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserID, setExpandedUserID] = useState<number | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getUsers();
      setUsers(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function onInviteSubmit(event: React.FormEvent) {
    event.preventDefault();
    setInviteLoading(true);
    setInviteError(null);
    setInviteLink(null);

    try {
      const created = await api.inviteUser(inviteEmail);
      setInviteLink(created.invitation.link);
      setInviteEmail("");
      await loadUsers();
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "failed to create invitation");
    } finally {
      setInviteLoading(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    const absolute = `${window.location.origin}${inviteLink}`;
    await navigator.clipboard.writeText(absolute);
  }

  async function copyUserInviteLink(link: string) {
    const absolute = `${window.location.origin}${link}`;
    await navigator.clipboard.writeText(absolute);
  }

  return (
    <div className="space-y-5">
      <Card title="Invite user">
        <form className="space-y-3" onSubmit={onInviteSubmit}>
          <label className="block text-sm text-zinc-300">
            User email
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
              type="email"
              required
              placeholder="new.user@company.com"
              value={inviteEmail}
              onInput={(event) => setInviteEmail((event.target as HTMLInputElement).value)}
            />
          </label>

          {inviteError && <p className="text-sm text-rose-400">{inviteError}</p>}

          <button
            className="rounded-lg bg-linear-to-r from-sky-600 to-cyan-600 px-4 py-2.5 font-medium text-white transition hover:from-sky-500 hover:to-cyan-500 disabled:opacity-50"
            type="submit"
            disabled={inviteLoading}
          >
            {inviteLoading ? "Creating invitation..." : "Create user invitation"}
          </button>
        </form>

        {inviteLink && (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            <p className="mb-2">Invitation link (share manually):</p>
            <div className="flex flex-wrap items-center gap-2">
              <a className="break-all text-sky-300 underline" href={inviteLink}>
                {window.location.origin}
                {inviteLink}
              </a>
              <button
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                type="button"
                onClick={() => void copyInviteLink()}
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card title="Users">
        {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
        {loading && <p className="mb-3 text-sm text-zinc-400">Loading users...</p>}

        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full table-fixed text-left text-sm">
            <thead className="bg-zinc-950/80">
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {!loading && users.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-zinc-400" colSpan={5}>
                    No users found.
                  </td>
                </tr>
              )}

              {users.map((entry) => {
                const isExpanded = expandedUserID === entry.id;
                const details: Array<{ key: string; value: string }> = [
                  { key: "id", value: String(entry.id) },
                  { key: "email", value: entry.email },
                  { key: "username", value: entry.username },
                  { key: "status", value: entry.status },
                  { key: "is_root", value: entry.is_root ? "true" : "false" },
                  { key: "created_at", value: entry.created_at },
                ];

                if (entry.invitation_id) {
                  details.push({ key: "invitation_id", value: entry.invitation_id });
                }

                return (
                  <Fragment key={entry.id}>
                    <tr
                      className="cursor-pointer border-b border-zinc-900/80 hover:bg-zinc-900/40"
                      onClick={() => setExpandedUserID((prev) => (prev === entry.id ? null : entry.id))}
                    >
                      <td className="px-3 py-2 text-zinc-400">{isExpanded ? "▾" : "▸"}</td>
                      <td className="truncate px-3 py-2 text-zinc-100">{entry.email}</td>
                      <td className="truncate px-3 py-2 text-zinc-300">{entry.username}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200">{entry.status}</span>
                      </td>
                      <td className="px-3 py-2 text-zinc-300">{formatDate(entry.created_at)}</td>
                    </tr>

                    {isExpanded && (
                      <tr className="border-b border-zinc-900/80 bg-zinc-950/40" key={`${entry.id}-details`}>
                        <td className="px-3 py-3" colSpan={5}>
                          <div className="grid gap-2 md:grid-cols-2">
                            {details.map((item) => (
                              <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2" key={`${entry.id}-${item.key}`}>
                                <p className="text-[10px] uppercase tracking-wide text-zinc-500">{item.key}</p>
                                <p className="wrap-break-word text-xs text-zinc-200">{item.value}</p>
                              </div>
                            ))}
                          </div>

                          {entry.status === "invited" && entry.invitation_link && (
                            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                              <p className="mb-2">Invitation link</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <a
                                  className="break-all text-sky-300 underline"
                                  href={entry.invitation_link}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {window.location.origin}
                                  {entry.invitation_link}
                                </a>
                                <button
                                  className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (entry.invitation_link) {
                                      void copyUserInviteLink(entry.invitation_link);
                                    }
                                  }}
                                >
                                  Copy
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
