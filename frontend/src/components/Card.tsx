import type { ReactNode } from "react";

export function Card(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-300">{props.title}</h2>
      {props.children}
    </section>
  );
}
