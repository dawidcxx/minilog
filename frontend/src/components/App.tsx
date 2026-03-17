import { useEffect, useState } from "react";
import { Redirect, Route, Router } from "wouter";
import { AppStateProvider } from "../context/AppStateContext";
import { api } from "../lib/api";
import { DashboardRoute } from "../routes/DashboardRoute";
import { InstallRoute } from "../routes/InstallRoute";
import { LoginRoute } from "../routes/LoginRoute";
import { RegisterRoute } from "../routes/RegisterRoute";
import type { BootState, User } from "../types";

export function App() {
  const [boot, setBoot] = useState<BootState | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [appStateLoading, setAppStateLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const b = await api.bootstrap();
        let me: User | null = null;

        if (b.has_user) {
          try {
            me = await api.me();
          } catch {
            me = null;
          }
        }

        if (cancelled) return;
        setBoot(b);
        setUser(me);
      } catch (err: unknown) {
        if (cancelled) return;
        setBoot({ has_user: false });
        setUser(null);
        setBootError(err instanceof Error ? err.message : "failed to bootstrap app");
      } finally {
        if (!cancelled) {
          setAppStateLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
  }

  function handleAuthDone(nextUser: User) {
    setBoot({ has_user: true });
    setUser(nextUser);
  }

  if (appStateLoading || !boot) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 text-zinc-50">
        <p className="text-zinc-300">Loading MiniLog...</p>
      </main>
    );
  }

  return (
    <AppStateProvider value={{ user, setUser }}>
      <Router>
        <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 text-zinc-50">
          <header className="mb-5">
            <h1 className="bg-linear-to-r from-cyan-300 to-sky-500 bg-clip-text text-3xl font-bold text-transparent">minilog</h1>
            <p className="mt-1 text-sm text-zinc-400">Lightweight PostgreSQL logs dashboard.</p>
          </header>

          <Route path="/">
            {!boot.has_user ? <Redirect to="/install" /> : !user ? <Redirect to="/login" /> : <DashboardRoute onLogout={handleLogout} />}
          </Route>

          <Route path="/login">{!boot.has_user ? <Redirect to="/install" /> : user ? <Redirect to="/" /> : <LoginRoute onDone={handleAuthDone} />}</Route>

          <Route path="/register">{boot.has_user ? <Redirect to="/" /> : <RegisterRoute onDone={handleAuthDone} bootError={bootError} />}</Route>

          <Route path="/install">{boot.has_user ? <Redirect to="/" /> : <InstallRoute onDone={handleAuthDone} bootError={bootError} />}</Route>

          <Route path="*">
            <Redirect to="/" />
          </Route>
        </main>
      </Router>
    </AppStateProvider>
  );
}