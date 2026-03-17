import { useState } from "react";
import { api } from "../lib/api";
import type { User } from "../types";
import { Card } from "./Card";

export function AuthForm(props: {
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

  async function onSubmit(event: React.SyntheticEvent) {
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
      <h3 className="text-xl font-semibold text-zinc-100">{title}</h3>
      <p className="mb-5 mt-1 text-sm text-zinc-400">{subtitle}</p>

      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm text-zinc-300">
          Email
          <input
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
            type="email"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            required
            placeholder="you@company.com"
          />
        </label>

        <label className="block text-sm text-zinc-300">
          Password
          <input
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none transition focus:border-sky-500"
            type="password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            required
            placeholder="••••••••"
          />
        </label>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button
          className="w-full rounded-lg bg-linear-to-r from-sky-600 to-cyan-600 px-4 py-2.5 font-medium text-white transition hover:from-sky-500 hover:to-cyan-500 disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? "Working..." : props.mode === "register" ? "Register" : "Login"}
        </button>
      </form>
    </Card>
  );
}
