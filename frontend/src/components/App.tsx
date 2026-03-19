import { useEffect, useState, type ReactNode } from "react";
import { Redirect, Route, Router, useLocation, Switch } from "wouter";
import { AppStateProvider } from "../context/AppStateContext";
import { api } from "../lib/api";
import { DashboardRoute } from "../routes/DashboardRoute";
import { InvitationRegisterRoute } from "../routes/InvitationRegisterRoute";
import { InstallRoute } from "../routes/InstallRoute";
import { LoginRoute } from "../routes/LoginRoute";
import { NotificationsRoute } from "../routes/NotificationsRoute";
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
        <AppRoutes boot={boot} user={user} bootError={bootError} onLogout={handleLogout} onAuthDone={handleAuthDone} />
      </Router>
    </AppStateProvider>
  );
}


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
        <DashboardRoute user={props.user as User} onLogout={props.onLogout} />
      </AuthedRoute>

      <AuthedRoute path="/users" boot={props.boot} user={props.user} requiresRoot>
        <UsersRoute user={props.user as User} onLogout={props.onLogout} />
      </AuthedRoute>

      <AuthedRoute path="/notifications" boot={props.boot} user={props.user} requiresRoot>
        <NotificationsRoute user={props.user as User} onLogout={props.onLogout} />
      </AuthedRoute>

      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}
