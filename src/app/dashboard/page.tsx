"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface BotRow {
  id: string;
  name: string;
  platform: "telegram" | "discord";
  status: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const [bots, setBots] = useState<BotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<"telegram" | "discord">("telegram");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/bots");
    setBots(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createBot(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    await fetch("/api/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), platform }),
    });
    setName("");
    setCreating(false);
    load();
  }

  async function removeBot(id: string) {
    if (!confirm("Удалить бота? Он будет остановлен.")) return;
    await fetch(`/api/bots/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-lg font-bold">
          Bot<span className="text-brand">Construct</span>.io
        </Link>
      </div>

      <h1 className="mt-8 text-2xl font-bold">Мои боты</h1>

      <form onSubmit={createBot} className="mt-4 flex flex-wrap gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название бота"
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as "telegram" | "discord")}
          className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        >
          <option value="telegram">Telegram</option>
          <option value="discord">Discord</option>
        </select>
        <button
          disabled={creating}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {creating ? "Создаю…" : "Создать"}
        </button>
      </form>

      <div className="mt-6 space-y-2">
        {loading && <p className="text-sm text-neutral-500">Загрузка…</p>}
        {!loading && bots.length === 0 && (
          <p className="text-sm text-neutral-500">Пока нет ботов. Создайте первого выше.</p>
        )}
        {bots.map((b) => (
          <div
            key={b.id}
            className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3"
          >
            <div>
              <div className="font-medium">{b.name}</div>
              <div className="text-xs text-neutral-500">
                {b.platform === "telegram" ? "Telegram" : "Discord"} ·{" "}
                <StatusBadge status={b.status} />
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/builder/${b.id}`}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              >
                Открыть
              </Link>
              <button
                onClick={() => removeBot(b.id)}
                className="rounded-lg border border-red-900 px-3 py-1.5 text-sm text-red-400 hover:bg-red-950"
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "text-green-400",
    error: "text-red-400",
    stopped: "text-neutral-500",
  };
  return <span className={map[status] ?? "text-neutral-500"}>{status}</span>;
}
