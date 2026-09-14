"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AdminModal } from "@/components/admin/AdminModal";

type SectionProductOrderItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  visibleOnSite: boolean;
};

type SectionProductOrderGroup = {
  id: string;
  name: string;
  isActive: boolean;
  products: SectionProductOrderItem[];
};

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  const clamped = Math.max(0, Math.min(to, next.length));
  next.splice(clamped, 0, item!);
  return next;
}

export function SectionProductOrderModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<SectionProductOrderGroup[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SectionProductOrderItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const active = sections.find((section) => section.id === activeId) ?? null;
  const dirty =
    Boolean(active) &&
    (draft.length !== active!.products.length ||
      draft.some((item, index) => item.id !== active!.products[index]?.id));

  const visible = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return draft.map((item, index) => ({ item, index }));
    return draft
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => normalizeSearch(item.name).includes(needle));
  }, [draft, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sections/product-order");
      const data = (await res.json()) as {
        sections?: SectionProductOrderGroup[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível carregar as seções.");
        return;
      }
      const next = data.sections ?? [];
      setSections(next);
      setActiveId((current) => {
        if (current && next.some((section) => section.id === current)) {
          return current;
        }
        return next[0]?.id ?? null;
      });
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!active) {
      setDraft([]);
      return;
    }
    setDraft(active.products);
  }, [activeId, sections]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  function selectSection(id: string) {
    if (id === activeId) return;
    if (dirty && !confirm("Descartar a ordem não salva desta seção?")) return;
    setQuery("");
    setActiveId(id);
  }

  function moveTo(from: number, to: number) {
    setDraft((prev) => moveItem(prev, from, to));
  }

  function applyPosition(from: number, raw: string) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    moveTo(from, parsed - 1);
  }

  function onDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setOverId(null);
      return;
    }
    const from = draft.findIndex((item) => item.id === draggingId);
    const to = draft.findIndex((item) => item.id === targetId);
    moveTo(from, to);
    setDraggingId(null);
    setOverId(null);
  }

  async function save() {
    if (!active) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/sections/${active.id}/products/order`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: draft.map((item) => item.id) }),
        }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar a ordem.");
        return;
      }
      setSections((prev) =>
        prev.map((section) =>
          section.id === active.id ? { ...section, products: draft } : section
        )
      );
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <AdminModal
      wide
      title="Ordenação das seções"
      subtitle="Arraste o produto ou informe a posição."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={!dirty || saving || !active}
            onClick={() => void save()}
            className="rounded-lg bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900 ring-1 ring-sky-200/80 hover:bg-sky-200 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar ordem"}
          </button>
        </>
      }
    >
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="py-10 text-center text-sm text-stone-400">
          Carregando seções…
        </p>
      ) : sections.length === 0 ? (
        <p className="py-10 text-center text-sm text-stone-400">
          Nenhuma seção cadastrada. Crie seções na aba Seções.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => selectSection(section.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  section.id === activeId
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {section.name}
                {!section.isActive ? (
                  <span className="ml-1 font-medium opacity-70">inativa</span>
                ) : null}
              </button>
            ))}
          </div>

          {draft.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">
              Nenhum produto nesta seção.
            </p>
          ) : (
            <>
              <label className="relative block">
                <span className="sr-only">Buscar produto na seção</span>
                <svg
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar nesta seção"
                  className="box-border h-9 w-full rounded-lg border border-stone-200 bg-white pl-8 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>

              {visible.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">
                  Nenhum produto com esse nome.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
                  {visible.map(({ item, index }) => (
                    <li
                      key={item.id}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (overId !== item.id) setOverId(item.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        onDrop(item.id);
                      }}
                      className={`flex items-center gap-2 px-2 py-2 sm:gap-3 sm:px-3 sm:py-2.5 ${
                        draggingId === item.id
                          ? "opacity-50"
                          : overId === item.id && draggingId
                            ? "bg-sky-50"
                            : ""
                      }`}
                    >
                      <div
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                          event.dataTransfer.setDragImage(
                            event.currentTarget,
                            40,
                            24
                          );
                          setDraggingId(item.id);
                          setOverId(item.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setOverId(null);
                        }}
                        className="flex min-w-0 flex-1 cursor-grab items-center gap-2 active:cursor-grabbing sm:gap-3"
                      >
                        <span
                          aria-hidden
                          className="flex h-8 w-7 shrink-0 items-center justify-center text-stone-400"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M5 3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm8 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM5 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm8 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM5 12.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm8 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
                          </svg>
                        </span>
                        <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded-md bg-stone-100">
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt=""
                              fill
                              className="pointer-events-none object-cover"
                              sizes="36px"
                              draggable={false}
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-stone-900">
                            {item.name}
                          </p>
                          {!item.visibleOnSite ? (
                            <p className="text-[11px] text-stone-400">
                              Oculto no site
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <label className="sr-only" htmlFor={`pos-${item.id}`}>
                          Posição de {item.name}
                        </label>
                        <input
                          id={`pos-${item.id}`}
                          type="number"
                          min={1}
                          max={draft.length}
                          key={`${item.id}-${index}`}
                          defaultValue={index + 1}
                          onBlur={(event) =>
                            applyPosition(index, event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                            }
                          }}
                          className="box-border h-7 w-12 rounded-md border border-stone-200 bg-white px-1 text-center text-xs tabular-nums text-stone-800 focus:border-stone-400 focus:outline-none"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </AdminModal>
  );
}
