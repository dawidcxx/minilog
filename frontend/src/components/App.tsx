import { useEffect, useState, type ReactNode } from "react";
import { Link, Redirect, Route, Router, useLocation, Switch } from "wouter";
import { AppStateProvider } from "../context/AppStateContext";
import { api } from "../lib/api";
import { DashboardRoute } from "../routes/DashboardRoute";
import { InvitationRegisterRoute } from "../routes/InvitationRegisterRoute";
import { InstallRoute } from "../routes/InstallRoute";
import { LoginRoute } from "../routes/LoginRoute";
import { RegisterRoute } from "../routes/RegisterRoute";
import { UsersRoute } from "../routes/UsersRoute";
import type { BootState, User } from "../types";

type GuardedRouteProps = {
  path: string;
  boot: BootState;
  user: User | null;
  requiresRoot?: boolean;
  children: ReactNode;
};

function AuthedRoute(props: GuardedRouteProps) {
  return (
    <Route path={props.path}>
      {!props.boot.has_user ? (
        <Redirect to="/install" />
      ) : !props.user ? (
        <Redirect to="/login" />
      ) : props.requiresRoot && !props.user.is_root ? (
        <Redirect to="/logs" />
      ) : (
        props.children
      )}
    </Route>
  );
}

function AuthenticatedNavigation(props: { user: User; onLogout: () => Promise<void> }) {
  const [location] = useLocation();

  const links = [{ href: "/logs", label: "Logs" }];
  if (props.user.is_root) {
    links.push({ href: "/users", label: "Users" });
  }

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        {links.map((entry) => {
          const active = location === entry.href;
          return (
            <Link href={entry.href} key={entry.href}>
              <span
                className={[
                  "cursor-pointer rounded-lg border px-3 py-2 text-sm transition",
                  active
                    ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                    : "border-zinc-700 text-zinc-300 hover:bg-zinc-800",
                ].join(" ")}
              >
                {entry.label}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <p className="text-sm text-zinc-400">{props.user.email}</p>
        <button
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
          onClick={() => props.onLogout()}
        >
          Logout
        </button>
      </div>
    </div>
  );
}

function AppRoutes(props: {
  boot: BootState;
  user: User | null;
  bootError: string | null;
  onLogout: () => Promise<void>;
  onAuthDone: (nextUser: User) => void;
}) {
  const [, setLocation] = useLocation();

  function handleAuthDoneAndRedirect(nextUser: User) {
    props.onAuthDone(nextUser);
    setLocation("/");
  }

  return (
    <Switch>
      <Route path="/">
        {!props.boot.has_user ? <Redirect to="/install" /> : !props.user ? <Redirect to="/login" /> : <Redirect to="/logs" />}
      </Route>

      <Route path="/register/:invitationId">
        {!props.boot.has_user ? <Redirect to="/install" /> : <InvitationRegisterRoute onDone={handleAuthDoneAndRedirect} />}
      </Route>

      <Route path="/register">
        {props.boot.has_user ? <Redirect to="/" /> : <RegisterRoute onDone={handleAuthDoneAndRedirect} bootError={props.bootError} />}
      </Route>

      <Route path="/install">
        {props.boot.has_user ? <Redirect to="/" /> : <InstallRoute onDone={handleAuthDoneAndRedirect} bootError={props.bootError} />}
      </Route>

      <Route path="/login">
        {!props.boot.has_user ? <Redirect to="/install" /> : props.user ? <Redirect to="/" /> : <LoginRoute onDone={handleAuthDoneAndRedirect} />}
      </Route>

      <AuthedRoute path="/logs" boot={props.boot} user={props.user}>
        <DashboardRoute onLogout={props.onLogout} />
      </AuthedRoute>

      <AuthedRoute path="/users" boot={props.boot} user={props.user} requiresRoot>
        <UsersRoute />
      </AuthedRoute>

      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

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

          {boot.has_user && user && <AuthenticatedNavigation user={user} onLogout={handleLogout} />}

          <AppRoutes boot={boot} user={user} bootError={bootError} onLogout={handleLogout} onAuthDone={handleAuthDone} />
        </main>
      </Router>
    </AppStateProvider>
  );
}