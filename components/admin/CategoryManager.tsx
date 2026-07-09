"use client";

import { useState, useEffect, useCallback } from "react";
import type { Category } from "@/lib/types";

interface CategoryManagerProps {
  onCategoriesChange?: () => void;
}

export function CategoryManager({ onCategoriesChange }: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(slug.trim() ? { slug: slug.trim() } : {}),
        }),
      });
      if (res.ok) {
        setName("");
        setSlug("");
        await fetchCategories();
        onCategoriesChange?.();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta categoria? Os produtos só perdem o vínculo."))
      return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchCategories();
        onCategoriesChange?.();
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-stone-200 bg-white p-6 space-y-4"
      >
        <h3 className="text-sm font-semibold text-stone-900">Nova categoria</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Nome *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
              placeholder="Ex: Vestidos"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Slug (opcional)
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
              placeholder="vestidos (gerado do nome se vazio)"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-sky-100 px-6 py-2 text-sm font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Criar categoria"}
          </button>
        </div>
      </form>

      <div>
        <h3 className="text-sm font-semibold text-stone-900 mb-3">
          Categorias ({categories.length})
        </h3>
        {categories.length === 0 ? (
          <p className="text-sm text-stone-500">Nenhuma categoria ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-stone-900">{c.name}</p>
                  <p className="text-xs text-stone-500 font-mono">{c.slug}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  disabled={deletingId === c.id}
                  className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  {deletingId === c.id ? "…" : "Excluir"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
