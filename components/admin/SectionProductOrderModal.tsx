"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
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

type OrderView = "mobile" | "desktop";

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
  const [view, setView] = useState<OrderView>("mobile");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{
    imageUrl: string | null;
    width: number;
    height: number;
  } | null>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    active: boolean;
  } | null>(null);
  const overRef = useRef<string | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const positionsRef = useRef<Map<string, DOMRect>>(new Map());
  const flipTokenRef = useRef(0);

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
    setView("mobile");
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

  function placeGhost(x: number, y: number) {
    const drag = dragRef.current;
    const node = ghostRef.current;
    if (!drag || !node) return;
    node.style.transformOrigin = `${drag.offsetX}px ${drag.offsetY}px`;
    node.style.transform = `translate3d(${x - drag.offsetX}px, ${y - drag.offsetY}px, 0) scale(1.04)`;
  }

  function clearDrag() {
    dragRef.current = null;
    overRef.current = null;
    setDraggingId(null);
    setGhost(null);
  }

  function hitProductId(x: number, y: number): string | null {
    return (
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-order-id]")
        ?.dataset.orderId ?? null
    );
  }

  function shiftTo(fromId: string, targetId: string) {
    if (targetId === fromId) {
      overRef.current = fromId;
      return;
    }
    if (targetId === overRef.current) return;
    overRef.current = targetId;
    setDraft((prev) => {
      const from = prev.findIndex((item) => item.id === fromId);
      const to = prev.findIndex((item) => item.id === targetId);
      return moveItem(prev, from, to);
    });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>, id: string) {
    if (event.button !== 0) return;
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: 0,
      offsetY: 0,
      active: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.active) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (dx * dx + dy * dy < 36) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.active = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.offsetX = event.clientX - rect.left;
    drag.offsetY = event.clientY - rect.top;
    overRef.current = drag.id;
    event.currentTarget.setPointerCapture(event.pointerId);
    const item = draft.find((entry) => entry.id === drag.id);
    setDraggingId(drag.id);
    setGhost({
      imageUrl: item?.imageUrl ?? null,
      width: rect.width,
      height: rect.height,
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.active) return;
    clearDrag();
  }

  useLayoutEffect(() => {
    const drag = dragRef.current;
    if (!ghost || !drag) return;
    placeGhost(drag.x, drag.y);
  }, [ghost]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const token = ++flipTokenRef.current;
    const nodes = [...list.querySelectorAll<HTMLElement>("[data-order-id]")];
    const next = new Map<string, DOMRect>();
    for (const node of nodes) {
      const id = node.dataset.orderId;
      if (!id) continue;
      node.style.transition = "none";
      node.style.transform = "";
      const rect = node.getBoundingClientRect();
      const prev = positionsRef.current.get(id);
      if (draggingId && id !== draggingId && prev) {
        const dx = prev.left - rect.left;
        const dy = prev.top - rect.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          node.style.transition = "none";
          node.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => {
            if (flipTokenRef.current !== token) return;
            node.style.transition = "transform 180ms ease";
            node.style.transform = "";
          });
        }
      }
      next.set(id, rect);
    }
    positionsRef.current = next;
  }, [draft, draggingId, view]);

  useEffect(() => {
    if (!draggingId) return;

    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag?.active || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      drag.x = event.clientX;
      drag.y = event.clientY;
      placeGhost(event.clientX, event.clientY);
      const nextId = hitProductId(event.clientX, event.clientY);
      if (nextId) shiftTo(drag.id, nextId);
    }

    function onUp(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag?.active || event.pointerId !== drag.pointerId) return;
      clearDrag();
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = previousCursor;
    };
  }, [draggingId]);

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
      subtitle="Arraste a imagem para mudar a posição."
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

              <div
                role="tablist"
                aria-label="Visualização da grade"
                className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1"
              >
                {(
                  [
                    ["mobile", "Visão Celular"],
                    ["desktop", "Visão PC"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={view === id}
                    onClick={() => setView(id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      view === id
                        ? "bg-white text-stone-900 shadow-sm"
                        : "text-stone-500 hover:text-stone-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {visible.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">
                  Nenhum produto com esse nome.
                </p>
              ) : (
                <div className={view === "desktop" ? "overflow-x-auto" : undefined}>
                  <ul
                    ref={listRef}
                    className={`grid gap-3 ${
                      view === "mobile"
                        ? "grid-cols-2"
                        : "grid-cols-4 max-md:min-w-[40rem]"
                    }`}
                  >
                    {visible.map(({ item, index }) => {
                      const dragging = draggingId === item.id;
                      return (
                        <li
                          key={item.id}
                          data-order-id={item.id}
                          className={`min-w-0 select-none ${dragging ? "opacity-40" : ""}`}
                        >
                          <div
                            onPointerDown={(event) => onPointerDown(event, item.id)}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={(event) => onPointerUp(event)}
                            className={`relative aspect-[3/4] cursor-grab select-none overflow-hidden rounded-lg bg-stone-100 active:cursor-grabbing ${
                              view === "mobile" ? "touch-none" : "touch-pan-x"
                            }`}
                          >
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt=""
                                fill
                                className="pointer-events-none object-cover"
                                sizes={
                                  view === "mobile"
                                    ? "(min-width: 768px) 240px, 45vw"
                                    : "180px"
                                }
                                draggable={false}
                              />
                            ) : null}
                            <span className="absolute left-1.5 top-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-stone-800">
                              {index + 1}
                            </span>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-xs font-medium text-stone-900">
                            {item.name}
                          </p>
                          {!item.visibleOnSite ? (
                            <p className="text-[11px] text-stone-400">
                              Oculto no site
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {ghost
        ? createPortal(
            <div
              ref={ghostRef}
              className="pointer-events-none fixed left-0 top-0 z-[80] cursor-grabbing overflow-hidden rounded-lg shadow-[0_18px_40px_-12px_rgba(28,25,23,0.45)] ring-2 ring-white"
              style={{ width: ghost.width, height: ghost.height }}
            >
              {ghost.imageUrl ? (
                <img
                  src={ghost.imageUrl}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-stone-200" />
              )}
            </div>,
            document.body
          )
        : null}
    </AdminModal>
  );
}
