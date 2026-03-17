import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Card } from "../components/Card";
import { api } from "../lib/api";
import type { InvitationDetails, User } from "../types";

type InvitationRegisterRouteProps = {
  onDone: (user: User) => void;
};

export function InvitationRegisterRoute(props: InvitationRegisterRouteProps) {
  const params = useParams<{ invitationId: string }>();
  const invitationId = params.invitationId;

  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getInvitation(invitationId);
        if (!cancelled) {
          setDetails(response);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "failed to load invitation");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError("passwords do not match");
      return;
    }

    if (!password) {
      setError("password is required");
      return;
    }

    setSubmitLoading(true);
    try {
      const user = await api.completeInvitation(invitationId, password);
      props.onDone(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "failed to complete registration");
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <Card title="Complete registration">
      {loading && <p className="text-sm text-zinc-400">Loading invitation...</p>}

      {!loading && details && (
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm text-zinc-300">
            Username
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-zinc-300"
              value={details.username}
              readOnly
            />
          </label>

          <label className="block text-sm text-zinc-300">
            Password
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
              type="password"
              value={password}
              onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
              required
            />
          </label>

          <label className="block text-sm text-zinc-300">
            Confirm password
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
              type="password"
              value={passwordConfirm}
              onInput={(event) => setPasswordConfirm((event.target as HTMLInputElement).value)}
              required
            />
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            className="w-full rounded-lg bg-linear-to-r from-sky-600 to-cyan-600 px-4 py-2.5 font-medium text-white transition hover:from-sky-500 hover:to-cyan-500 disabled:opacity-50"
            type="submit"
            disabled={submitLoading}
          >
            {submitLoading ? "Completing..." : "Complete registration"}
          </button>
        </form>
      )}

      {!loading && !details && error && <p className="text-sm text-rose-400">{error}</p>}
    </Card>
  );
}
