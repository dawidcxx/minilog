import type { ReactNode } from "react";

export function SkeletonLayout(props: { children: ReactNode }) {
    return (
        <main className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-6 text-zinc-50">
            <header className="mb-3 w-full max-w-sm">
                <h1 className="bg-linear-to-r from-cyan-300 to-sky-500 bg-clip-text text-3xl font-bold text-transparent">minilog</h1>
                <p className="mt-1 text-sm text-zinc-400">Lightweight PostgreSQL logs dashboard & alerts</p>
            </header>

            <section className="w-full max-w-sm">{props.children}</section>
        </main>
    );
}
