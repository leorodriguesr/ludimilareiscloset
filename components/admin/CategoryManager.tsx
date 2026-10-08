"use client";

import { useState, useEffect, useCallback } from "react";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { cloudinaryImageUrl } from "@/lib/images/cloudinary-url";
import type { Category } from "@/lib/types";

interface CategoryPhoto {
  url: string;
  productName: string;
}

interface CategoryWithPhotos extends Category {
  photos: CategoryPhoto[];
}

interface CategoryManagerProps {
  onCategoriesChange?: () => void;
}

export function CategoryManager({ onCategoriesChange }: CategoryManagerProps) {
  const [categories, setCategories] = useState<CategoryWithPhotos[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingCoverId, setSavingCoverId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/admin/category-covers");
    const data = await res.json();
    setCategories(Array.isArray(data) ? data : []);
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

  async function saveCover(id: string, coverImageUrl: string | null) {
    setSavingCoverId(id);
    setCategories((current) =>
      current.map((category) =>
        category.id === id ? { ...category, coverImageUrl } : category
      )
    );
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImageUrl }),
      });
      if (!res.ok) await fetchCategories();
    } finally {
      setSavingCoverId(null);
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
          <ul className="space-y-4">
            {categories.map((c, index) => (
              <li
                key={c.id}
                className="rounded-xl border border-stone-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-stone-900">{c.name}</p>
                    <p className="text-xs text-stone-500 font-mono">{c.slug}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {index < 4
                        ? "Aparece com foto na página inicial."
                        : "Fica só no filtro. As quatro primeiras categorias, em ordem alfabética, entram na página inicial."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {deletingId === c.id ? "…" : "Excluir"}
                  </button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-[7rem_1fr]">
                  <div>
                    <p className="mb-2 text-xs font-medium text-stone-600">
                      Foto atual
                    </p>
                    <div className="aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
                      {c.coverImageUrl ? (
                        <img
                          src={cloudinaryImageUrl(c.coverImageUrl, 280)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center px-2 text-center text-[11px] text-stone-400">
                          Automática
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-stone-600">
                        Fotos dos produtos
                      </p>
                      {c.coverImageUrl ? (
                        <button
                          type="button"
                          onClick={() => saveCover(c.id, null)}
                          disabled={savingCoverId === c.id}
                          className="text-xs font-medium text-stone-600 hover:text-stone-900 disabled:opacity-50"
                        >
                          Usar foto automática
                        </button>
                      ) : null}
                    </div>
                    {c.photos.length === 0 ? (
                      <p className="text-xs text-stone-500">
                        Nenhum produto visível nesta categoria. Envie uma imagem abaixo.
                      </p>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {c.photos.map((photo) => {
                          const selected = c.coverImageUrl === photo.url;
                          return (
                            <button
                              key={photo.url}
                              type="button"
                              title={photo.productName}
                              aria-label={`Usar foto de ${photo.productName}`}
                              aria-pressed={selected}
                              disabled={savingCoverId === c.id}
                              onClick={() => saveCover(c.id, photo.url)}
                              className={`h-24 w-16 shrink-0 overflow-hidden rounded-md bg-stone-100 ring-2 ring-offset-1 disabled:opacity-60 ${
                                selected ? "ring-stone-900" : "ring-transparent"
                              }`}
                            >
                              <img
                                src={cloudinaryImageUrl(photo.url, 200)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-3 max-w-xs">
                      <ImageUpload
                        value=""
                        maxFilesPerBatch={1}
                        folder="ludimila-reis-closet/categorias"
                        onChange={(url) => {
                          if (url) void saveCover(c.id, url);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
