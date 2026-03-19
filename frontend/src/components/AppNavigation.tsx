import { Link, useLocation } from "wouter";
import type { User } from "../types";

export function AppNavigation(props: { user: User; onLogout: () => Promise<void> }) {
  const [location] = useLocation();

  const links = [{ href: "/logs", label: "Logs" }];
  if (props.user.is_root) {
    links.push({ href: "/users", label: "Users" });
    links.push({ href: "/notifications", label: "Notifications" });
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
