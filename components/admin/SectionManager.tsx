"use client";

import { useState, useEffect, useCallback } from "react";
import type { Section } from "@/lib/types";

interface SectionManagerProps {
  onSectionsChange?: () => void;
}

export function SectionManager({ onSectionsChange }: SectionManagerProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const fetchSections = useCallback(async () => {
    const res = await fetch("/api/sections");
    const data = await res.json();
    setSections(data);
  }, []);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setName("");
        await fetchSections();
        onSectionsChange?.();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        "Excluir esta seção? Os produtos só perdem o vínculo, não serão removidos."
      )
    )
      return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/sections/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchSections();
        onSectionsChange?.();
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(section: Section) {
    setTogglingId(section.id);
    try {
      await fetch(`/api/sections/${section.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !section.isActive }),
      });
      await fetchSections();
      onSectionsChange?.();
    } finally {
      setTogglingId(null);
    }
  }

  async function handleMove(id: string, direction: "up" | "down") {
    const idx = sections.findIndex((s) => s.id === id);
    if (
      (direction === "up" && idx === 0) ||
      (direction === "down" && idx === sections.length - 1)
    )
      return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const current = sections[idx];
    const swap = sections[swapIdx];

    setMovingId(id);
    try {
      await Promise.all([
        fetch(`/api/sections/${current.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: swap.order }),
        }),
        fetch(`/api/sections/${swap.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: current.order }),
        }),
      ]);
      await fetchSections();
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-stone-200 bg-white p-6 space-y-4"
      >
        <h3 className="text-sm font-semibold text-stone-900">Nova seção</h3>
        <p className="text-xs text-stone-500">
          Seções são vitrines temáticas na página inicial (ex.: Promoção,
          Lançamentos, Mais Vendidos). Ao cadastrar um produto, escolha em qual
          seção ele aparece.
        </p>
        <div className="max-w-sm">
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Nome *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
            placeholder="Ex: Lançamentos, Promoção, Mais Vendidos"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-sky-100 px-6 py-2 text-sm font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Criar seção"}
          </button>
        </div>
      </form>

      <div>
        <h3 className="text-sm font-semibold text-stone-900 mb-1">
          Seções ({sections.length})
        </h3>
        <p className="text-xs text-stone-500 mb-3">
          A ordem aqui define a ordem de exibição na página inicial. Use as
          setas para reordenar.
        </p>
        {sections.length === 0 ? (
          <p className="text-sm text-stone-500">Nenhuma seção ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {sections.map((s, idx) => (
              <li
                key={s.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleMove(s.id, "up")}
                    disabled={idx === 0 || movingId === s.id}
                    className="rounded p-0.5 text-stone-400 hover:text-stone-700 disabled:opacity-20"
                    aria-label="Mover para cima"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M8 4l6 6H2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(s.id, "down")}
                    disabled={
                      idx === sections.length - 1 || movingId === s.id
                    }
                    className="rounded p-0.5 text-stone-400 hover:text-stone-700 disabled:opacity-20"
                    aria-label="Mover para baixo"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M8 12l6-6H2z" />
                    </svg>
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-900">
                    {s.name}
                  </p>
                  <p className="text-xs text-stone-400 font-mono">{s.slug}</p>
                </div>

                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.isActive
                      ? "bg-green-50 text-green-700"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {s.isActive ? "Ativa" : "Oculta"}
                </span>

                <button
                  type="button"
                  onClick={() => handleToggleActive(s)}
                  disabled={togglingId === s.id}
                  className="shrink-0 text-xs font-medium text-stone-600 hover:text-stone-900 disabled:opacity-50"
                >
                  {togglingId === s.id
                    ? "…"
                    : s.isActive
                    ? "Ocultar"
                    : "Exibir"}
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  disabled={deletingId === s.id}
                  className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  {deletingId === s.id ? "…" : "Excluir"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
