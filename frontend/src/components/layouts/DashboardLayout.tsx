import type { ReactNode } from "react";

export function DashboardLayout(props: { children: ReactNode; navigation?: ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 text-zinc-50">
      <header className="mb-5">
        <h1 className="bg-linear-to-r from-cyan-300 to-sky-500 bg-clip-text text-3xl font-bold text-transparent">minilog</h1>
        <p className="mt-1 text-sm text-zinc-400">Lightweight PostgreSQL logs dashboard & alerts</p>
      </header>

      {props.navigation}
      {props.children}
    </main>
  );
}
