"use client";

import { useState, useEffect, useCallback } from "react";
import type { Category, Section } from "@/lib/types";
import {
  MESCLADO_BW_HEX,
  colorSwatchStyle,
  normalizeHexColor,
} from "@/lib/color-swatch";
import {
  getPieceColorBinding,
  setPieceColorBinding,
} from "@/lib/image-color-bindings";
import {
  SIZE_ONLY_COLOR_HEX,
  SIZE_ONLY_COLOR_NAME,
  isSizeOnlyColorName,
} from "@/lib/piece-size-only-color";
import { ImageUpload } from "./ImageUpload";

const STOCK = { UNLIMITED: "UNLIMITED", LIMITED: "LIMITED" } as const;
type StockTypeValue = (typeof STOCK)[keyof typeof STOCK];

/** Estoque do produto = soma das quantidades por tamanho (e cor, se houver). */
function computeProductStockFromPieces(
  namedPieces: PieceForm[]
): { stockType: StockTypeValue; stockQuantity: number | null } {
  let sum = 0;
  let hasVariantMatrix = false;
  for (const p of namedPieces) {
    const reconciled = reconcileVariants(p);
    if (p.sizes.length > 0 && reconciled.variants.length > 0) {
      hasVariantMatrix = true;
      for (const v of reconciled.variants) {
        sum += Math.max(
          0,
          Math.floor(Number.parseInt(String(v.quantity).trim(), 10) || 0)
        );
      }
    }
  }
  if (hasVariantMatrix) {
    return { stockType: STOCK.LIMITED, stockQuantity: sum };
  }
  return { stockType: STOCK.UNLIMITED, stockQuantity: null };
}

interface PieceVariantForm {
  colorName: string;
  sizeName: string;
  quantity: string;
}

interface PieceForm {
  name: string;
  colors: { name: string; hex: string }[];
  sizes: { name: string }[];
  variants: PieceVariantForm[];
}

interface ProductData {
  id?: string;
  name: string;
  price: number;
  installmentCount: number | null;
  pixPrice: number | null;
  costPrice: number | null;
  description: string;
  tag: string;
  videoUrl: string | null;
  stockType: "UNLIMITED" | "LIMITED";
  stockQuantity: number | null;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  images: { url: string; colorName?: string | null }[];
  pieces: PieceForm[];
  categoryIds: string[];
  sectionIds: string[];
}

function reconcileVariants(piece: PieceForm): PieceForm {
  const prev = piece.variants;
  if (piece.sizes.length === 0) {
    return { ...piece, variants: [] };
  }

  const colorsForMatrix =
    piece.colors.length > 0
      ? piece.colors
      : [{ name: SIZE_ONLY_COLOR_NAME, hex: SIZE_ONLY_COLOR_HEX }];

  const next: PieceVariantForm[] = [];
  for (const c of colorsForMatrix) {
    for (const s of piece.sizes) {
      const found = prev.find(
        (v) => v.colorName === c.name && v.sizeName === s.name
      );
      const fromSizeOnly =
        !found &&
        piece.colors.length > 0
          ? prev.find(
              (v) =>
                isSizeOnlyColorName(v.colorName) && v.sizeName === s.name
            )
          : undefined;
      next.push({
        colorName: c.name,
        sizeName: s.name,
        quantity: found?.quantity ?? fromSizeOnly?.quantity ?? "0",
      });
    }
  }
  return { ...piece, variants: next };
}

function mapInitialPieces(
  raw: ProductData["pieces"] | undefined
): PieceForm[] {
  if (!raw?.length) return [];
  return raw.map((p) => {
    const sizeOnly =
      p.colors.length === 1 && isSizeOnlyColorName(p.colors[0]?.name);
    return reconcileVariants({
      name: p.name,
      colors: sizeOnly ? [] : p.colors.map((c) => ({ ...c })),
      sizes: p.sizes.map((s) => ({ ...s })),
      variants:
        p.variants?.map((v) => ({
          colorName: v.colorName,
          sizeName: v.sizeName,
          quantity: String(v.quantity),
        })) ?? [],
    });
  });
}

function serializePieceForApi(piece: PieceForm) {
  const reconciled = reconcileVariants(piece);
  const colors =
    piece.colors.length > 0
      ? piece.colors
      : piece.sizes.length > 0
        ? [{ name: SIZE_ONLY_COLOR_NAME, hex: SIZE_ONLY_COLOR_HEX }]
        : [];
  return {
    name: piece.name.trim(),
    colors,
    sizes: piece.sizes,
    variants: reconciled.variants.map((v) => ({
      colorName: v.colorName,
      sizeName: v.sizeName,
      quantity: Math.max(
        0,
        Math.floor(Number.parseInt(String(v.quantity).trim(), 10) || 0)
      ),
    })),
  };
}

interface ProductFormProps {
  initialData?: ProductData;
  onSuccess: () => void;
}

const LABEL_CLASS = "mb-1.5 block text-sm font-semibold text-stone-800";
const INPUT_CLASS =
  "w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 transition-colors";
const SECTION_CLASS =
  "space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5";
const SECTION_TITLE_CLASS = "text-sm font-semibold text-stone-900";
const HELPER_CLASS = "mt-1.5 text-xs text-stone-500";

const COMMON_SIZES = ["PP", "P", "M", "G", "GG", "XG"];

const COMMON_COLORS = [
  { name: "Preto", hex: "#000000" },
  { name: "Branco", hex: "#FFFFFF" },
  { name: "Mesclado (Preto/Branco)", hex: MESCLADO_BW_HEX },
  { name: "Vermelho", hex: "#DC2626" },
  { name: "Azul", hex: "#2563EB" },
  { name: "Rosa", hex: "#EC4899" },
  { name: "Bege", hex: "#D4A574" },
  { name: "Marrom", hex: "#78350F" },
  { name: "Verde", hex: "#16A34A" },
  { name: "Cinza", hex: "#6B7280" },
  { name: "Nude", hex: "#E8C4A0" },
];

const COMMON_COLOR_NAMES = new Set(COMMON_COLORS.map((c) => c.name));

export function ProductForm({ initialData, onSuccess }: ProductFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: initialData?.name ?? "",
    price: initialData?.price?.toString() ?? "",
    pixPrice:
      initialData?.pixPrice != null ? String(initialData.pixPrice) : "",
    installmentCount:
      initialData?.installmentCount != null
        ? String(initialData.installmentCount)
        : "",
    costPrice:
      initialData?.costPrice != null ? String(initialData.costPrice) : "",
    description: initialData?.description ?? "",
    tag: initialData?.tag ?? "",
    videoUrl: initialData?.videoUrl ?? "",
    weightGrams:
      initialData?.weightGrams != null ? String(initialData.weightGrams) : "",
    lengthCm: initialData?.lengthCm != null ? String(initialData.lengthCm) : "",
    widthCm: initialData?.widthCm != null ? String(initialData.widthCm) : "",
    heightCm: initialData?.heightCm != null ? String(initialData.heightCm) : "",
  });
  const [categoryIds, setCategoryIds] = useState<string[]>(
    initialData?.categoryIds ?? []
  );
  const [sectionIds, setSectionIds] = useState<string[]>(
    initialData?.sectionIds ?? []
  );
  const [images, setImages] = useState<{ url: string; colorName?: string | null }[]>(
    initialData?.images ?? []
  );
  const [pieces, setPieces] = useState<PieceForm[]>(() =>
    mapInitialPieces(initialData?.pieces)
  );
  const [customColorDraft, setCustomColorDraft] = useState<
    Record<number, { name: string; hex: string }>
  >({});
  const [showCustomColorForm, setShowCustomColorForm] = useState<
    Record<number, boolean>
  >({});

  const isEditing = !!initialData?.id;

  const loadCategories = useCallback(async () => {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data);
  }, []);

  const loadSections = useCallback(async () => {
    const res = await fetch("/api/sections");
    const data = await res.json();
    setSections(data);
  }, []);

  useEffect(() => {
    loadCategories();
    loadSections();
  }, [loadCategories, loadSections]);

  function toggleCategory(id: string) {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSection(id: string) {
    setSectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function addPiece() {
    setPieces([
      ...pieces,
      { name: "", colors: [], sizes: [], variants: [] },
    ]);
  }

  function removePiece(index: number) {
    setPieces(pieces.filter((_, i) => i !== index));
  }

  function updatePiece(index: number, updates: Partial<PieceForm>) {
    setPieces(pieces.map((p, i) => (i === index ? { ...p, ...updates } : p)));
  }

  function toggleSize(pieceIndex: number, sizeName: string) {
    setPieces((prev) =>
      prev.map((p, i) => {
        if (i !== pieceIndex) return p;
        const exists = p.sizes.some((s) => s.name === sizeName);
        const nextSizes = exists
          ? p.sizes.filter((s) => s.name !== sizeName)
          : [...p.sizes, { name: sizeName }];
        return reconcileVariants({ ...p, sizes: nextSizes });
      })
    );
  }

  function toggleColor(
    pieceIndex: number,
    colorName: string,
    hex: string
  ) {
    setPieces((prev) =>
      prev.map((p, i) => {
        if (i !== pieceIndex) return p;
        const exists = p.colors.some((c) => c.name === colorName);
        const nextColors = exists
          ? p.colors.filter((c) => c.name !== colorName)
          : [...p.colors, { name: colorName, hex }];
        return reconcileVariants({ ...p, colors: nextColors });
      })
    );
  }

  function updateCustomColorDraft(
    pieceIndex: number,
    field: "name" | "hex",
    value: string
  ) {
    setCustomColorDraft((prev) => ({
      ...prev,
      [pieceIndex]: {
        name: prev[pieceIndex]?.name ?? "",
        hex: prev[pieceIndex]?.hex ?? "",
        [field]: value,
      },
    }));
  }

  function addCustomColor(pieceIndex: number) {
    const draft = customColorDraft[pieceIndex] ?? { name: "", hex: "" };
    const name = draft.name.trim();
    const hex = normalizeHexColor(draft.hex);
    if (!name || !hex) return;

    setPieces((prev) =>
      prev.map((p, i) => {
        if (i !== pieceIndex) return p;
        const withoutSame = p.colors.filter(
          (c) => c.name.toLowerCase() !== name.toLowerCase()
        );
        return reconcileVariants({
          ...p,
          colors: [...withoutSame, { name, hex }],
        });
      })
    );
    setCustomColorDraft((prev) => ({
      ...prev,
      [pieceIndex]: { name: "", hex: "" },
    }));
  }

  function updateVariantQty(
    pieceIndex: number,
    colorName: string,
    sizeName: string,
    quantity: string
  ) {
    setPieces((prev) =>
      prev.map((p, i) => {
        if (i !== pieceIndex) return p;
        const variants = (p.variants ?? []).map((v) =>
          v.colorName === colorName && v.sizeName === sizeName
            ? { ...v, quantity }
            : v
        );
        return { ...p, variants };
      })
    );
  }

  function addImage(url: string) {
    setImages((prev) => [...prev, { url, colorName: null }]);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function setImagePieceColor(
    index: number,
    pieceName: string,
    colorName: string | null
  ) {
    setImages((prev) =>
      prev.map((img, i) => {
        if (i !== index) return img;
        return {
          ...img,
          colorName: setPieceColorBinding(img.colorName, pieceName, colorName),
        };
      })
    );
  }

  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(
    null
  );
  const [dragOverImageIndex, setDragOverImageIndex] = useState<number | null>(
    null
  );

  function moveImage(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setImages((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }

  function emptyFormState() {
    setForm({
      name: "",
      price: "",
      pixPrice: "",
      installmentCount: "",
      costPrice: "",
      description: "",
      tag: "",
      videoUrl: "",
      weightGrams: "",
      lengthCm: "",
      widthCm: "",
      heightCm: "",
    });
    setCategoryIds([]);
    setSectionIds([]);
    setImages([]);
    setPieces([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (images.length === 0) return;
    setLoading(true);

    try {
      const url = isEditing
        ? `/api/products/${initialData!.id}`
        : "/api/products";

      const costPriceVal = form.costPrice.trim();
      const costParsed =
        costPriceVal === ""
          ? null
          : (() => {
              const x = parseFloat(costPriceVal.replace(",", "."));
              return Number.isFinite(x) && x >= 0 ? x : null;
            })();

      const pixPriceVal = form.pixPrice.trim();
      const pixParsed =
        pixPriceVal === ""
          ? null
          : (() => {
              const x = parseFloat(pixPriceVal.replace(",", "."));
              return Number.isFinite(x) && x >= 0 ? x : null;
            })();

      const namedPieces = pieces.filter((p) => p.name.trim());
      const { stockType, stockQuantity } =
        computeProductStockFromPieces(namedPieces);

      const icTrim = form.installmentCount.trim();
      let installmentPayload: number | null = null;
      if (icTrim !== "") {
        const n = Math.floor(Number(icTrim.replace(",", ".")));
        if (!Number.isFinite(n) || n < 1 || n > 24) {
          setLoading(false);
          window.alert(
            "Parcelas: informe um número entre 1 e 24 ou deixe em branco."
          );
          return;
        }
        installmentPayload = n;
      }

      const payload = {
        name: form.name,
        price: parseFloat(form.price),
        installmentCount: installmentPayload,
        pixPrice: pixParsed,
        costPrice: costParsed,
        description: form.description || null,
        tag: form.tag || null,
        videoUrl: form.videoUrl.trim() || null,
        stockType,
        stockQuantity,
        weightGrams: form.weightGrams.trim() === "" ? null : form.weightGrams,
        lengthCm: form.lengthCm.trim() === "" ? null : form.lengthCm,
        widthCm: form.widthCm.trim() === "" ? null : form.widthCm,
        heightCm: form.heightCm.trim() === "" ? null : form.heightCm,
        images,
        pieces: namedPieces.map(serializePieceForApi),
        categoryIds,
        sectionIds,
      };

      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (!isEditing) emptyFormState();
        onSuccess();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
      <section className={SECTION_CLASS}>
        <h3 className={SECTION_TITLE_CLASS}>Informações básicas</h3>
        <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>
            Nome *
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={INPUT_CLASS}
            placeholder="Nome do produto"
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>
            Preço de venda (R$) *
          </label>
          <input
            type="number"
            required
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className={INPUT_CLASS}
            placeholder="99.90"
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>
            Pagamento por Pix (R$)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.pixPrice}
            onChange={(e) => setForm({ ...form, pixPrice: e.target.value })}
            className={INPUT_CLASS}
            placeholder="Ex.: 89,90"
          />
          <p className={HELPER_CLASS}>
            Opcional. Só aparece o card “Pix” na página do produto quando este
            valor estiver preenchido.
          </p>
        </div>
        <div>
          <label className={LABEL_CLASS}>
            Parcelas no cartão (sem juros)
          </label>
          <input
            type="number"
            min={1}
            max={24}
            step={1}
            value={form.installmentCount}
            onChange={(e) =>
              setForm({ ...form, installmentCount: e.target.value })
            }
            className={INPUT_CLASS}
            placeholder="Ex.: 3 — vazio = só preço no cartão"
          />
          <p className={HELPER_CLASS}>
            Opcional. Com número, a vitrine mostra “Parcelamento” (Nx sem
            juros). Vazio, só “Cartão” com o preço.
          </p>
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS}>
          Preço de custo (R$)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={form.costPrice}
          onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
          className={`${INPUT_CLASS} max-w-xs`}
          placeholder="Opcional — uso interno"
        />
      </div>
      </section>

      <section className={SECTION_CLASS}>
        <h3 className={SECTION_TITLE_CLASS}>
          Peso e dimensões (envio)
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Peso (g)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.weightGrams}
              onChange={(e) =>
                setForm({ ...form, weightGrams: e.target.value })
              }
              className={INPUT_CLASS}
              placeholder="Ex: 320"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Comprimento (cm)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.lengthCm}
              onChange={(e) => setForm({ ...form, lengthCm: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Largura (cm)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.widthCm}
              onChange={(e) => setForm({ ...form, widthCm: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Altura (cm)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.heightCm}
              onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h3 className={SECTION_TITLE_CLASS}>Mídia e vitrine</h3>
      <div>
        <label className={LABEL_CLASS}>
          Link do vídeo (YouTube, Vimeo ou outro)
        </label>
        <input
          type="url"
          value={form.videoUrl}
          onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
          className={INPUT_CLASS}
          placeholder="https://..."
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>
          Seções
        </label>
        <p className={`${HELPER_CLASS} mb-2`}>
          Escolha em qual seção da página inicial este produto aparecerá (ex:
          Promoção, Lançamentos).
        </p>
        {sections.length === 0 ? (
          <p className="text-xs text-stone-500">
            Crie seções na aba &quot;Seções&quot; do admin.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <label
                key={s.id}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  sectionIds.includes(s.id)
                    ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                    : "border-stone-300 bg-stone-50 text-stone-700 hover:border-stone-400 hover:bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={sectionIds.includes(s.id)}
                  onChange={() => toggleSection(s.id)}
                />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className={`${LABEL_CLASS} mb-2`}>
          Categorias
        </label>
        {categories.length === 0 ? (
          <p className="text-xs text-stone-500">
            Crie categorias na aba &quot;Categorias&quot; do admin.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <label
                key={c.id}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  categoryIds.includes(c.id)
                    ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                    : "border-stone-300 bg-stone-50 text-stone-700 hover:border-stone-400 hover:bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={categoryIds.includes(c.id)}
                  onChange={() => toggleCategory(c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className={LABEL_CLASS}>
          Descrição
        </label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className={`${INPUT_CLASS} resize-none`}
          placeholder="Descrição do produto (opcional)"
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>
          Tag
        </label>
        <input
          type="text"
          value={form.tag}
          onChange={(e) => setForm({ ...form, tag: e.target.value })}
          className={INPUT_CLASS}
          placeholder="Ex: Novo, Promoção, Destaque"
        />
      </div>
      </section>

      <section className={SECTION_CLASS}>
        <h3 className={SECTION_TITLE_CLASS}>
          Imagens * ({images.length}{" "}
          {images.length === 1 ? "foto" : "fotos"})
        </h3>
        <p className={HELPER_CLASS}>
          Arraste uma foto sobre outra para mudar a ordem. A primeira continua
          sendo a capa. Vincule a cor de cada peça na foto para a galeria
          trocar conforme a escolha do cliente.
        </p>
        <div className="flex flex-wrap gap-3 mb-3">
          {images.map((img, i) => {
            const piecesWithColors = pieces.filter(
              (p) =>
                p.name.trim() &&
                p.colors.some((c) => !isSizeOnlyColorName(c.name))
            );
            return (
              <div key={img.url} className="flex flex-col gap-1">
                <div className="relative">
                  <div
                    aria-label={`Foto ${i + 1}, arraste para reordenar`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(i));
                      setDraggedImageIndex(i);
                    }}
                    onDragEnd={() => {
                      setDraggedImageIndex(null);
                      setDragOverImageIndex(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverImageIndex(i);
                    }}
                    onDragLeave={() => {
                      setDragOverImageIndex((prev) => (prev === i ? null : prev));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw = e.dataTransfer.getData("text/plain");
                      const from = parseInt(raw, 10);
                      if (!Number.isFinite(from)) return;
                      moveImage(from, i);
                      setDraggedImageIndex(null);
                      setDragOverImageIndex(null);
                    }}
                    className={`h-24 w-24 cursor-grab overflow-hidden rounded-lg bg-stone-100 outline-none ring-stone-900/20 transition-[opacity,box-shadow] active:cursor-grabbing ${
                      draggedImageIndex === i ? "opacity-50" : ""
                    } ${
                      dragOverImageIndex === i && draggedImageIndex !== i
                        ? "ring-2 ring-stone-900 ring-offset-2"
                        : ""
                    }`}
                  >
                    <img
                      src={img.url}
                      alt=""
                      draggable={false}
                      className="pointer-events-none h-full w-full select-none object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    draggable={false}
                    onClick={() => removeImage(i)}
                    className="absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white hover:bg-red-600 transition-colors"
                  >
                    X
                  </button>
                  {i === 0 && (
                    <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-stone-900/80 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider text-white">
                      Capa
                    </span>
                  )}
                </div>
                {piecesWithColors.length > 0 && (
                  <div className="flex w-24 flex-col gap-1">
                    {piecesWithColors.map((piece) => {
                      const pieceName = piece.name.trim();
                      const colors = piece.colors.filter(
                        (c) => !isSizeOnlyColorName(c.name)
                      );
                      return (
                        <label key={pieceName} className="block">
                          <span className="mb-0.5 block truncate text-[9px] font-medium text-stone-500">
                            {pieceName}
                          </span>
                          <select
                            value={getPieceColorBinding(img.colorName, pieceName)}
                            onChange={(e) =>
                              setImagePieceColor(
                                i,
                                pieceName,
                                e.target.value || null
                              )
                            }
                            className="w-full rounded border border-stone-200 bg-white px-1 py-0.5 text-[10px] text-stone-700 focus:border-stone-900 focus:outline-none"
                            title={`Cor da ${pieceName} nesta imagem`}
                          >
                            <option value="">— cor —</option>
                            {colors.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <ImageUpload
          value=""
          onChange={addImage}
          folder="ludimila-reis-closet/products"
          maxFilesPerBatch={15}
        />
      </section>

      <section className={SECTION_CLASS}>
        <div className="flex items-center justify-between gap-3">
          <h3 className={SECTION_TITLE_CLASS}>
            Peças e Variações
          </h3>
          <button
            type="button"
            onClick={addPiece}
            className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition-colors hover:border-stone-400 hover:bg-stone-50"
          >
            + Adicionar peça
          </button>
        </div>
        <p className={HELPER_CLASS}>
          Para cada peça, marque os tamanhos e as cores. Em seguida use a
          tabela para informar quantas unidades existem de cada combinação
          (ex.: P + Branco = 2).
        </p>

        {pieces.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 py-6 text-center text-xs text-stone-500">
            Nenhuma peça adicionada. Clique em &quot;Adicionar peça&quot; para
            definir tamanhos, cores e quantidades por combinação.
          </p>
        )}

        <div className="space-y-4">
          {pieces.map((piece, pi) => (
            <div
              key={pi}
              className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/80 p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={piece.name}
                  onChange={(e) => updatePiece(pi, { name: e.target.value })}
                  className={`${INPUT_CLASS} flex-1`}
                  placeholder="Nome da peça (ex: Blusa, Calça)"
                />
                <button
                  type="button"
                  onClick={() => removePiece(pi)}
                  className="text-red-500 hover:text-red-700 transition-colors"
                  aria-label="Remover"
                  title="Remover"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-stone-700">
                  Tamanhos
                </p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_SIZES.map((size) => {
                    const active = piece.sizes.some((s) => s.name === size);
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => toggleSize(pi, size)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                            : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-stone-700">Cores</p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_COLORS.map((color) => {
                    const active = piece.colors.some(
                      (c) => c.name === color.name
                    );
                    return (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => toggleColor(pi, color.name, color.hex)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                            : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
                        }`}
                      >
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full border border-stone-300"
                          style={colorSwatchStyle(color.hex)}
                        />
                        {color.name}
                      </button>
                    );
                  })}
                  {piece.colors
                    .filter((c) => !COMMON_COLOR_NAMES.has(c.name))
                    .map((color) => (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => toggleColor(pi, color.name, color.hex)}
                        className="flex items-center gap-1.5 rounded-lg border border-stone-900 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
                      >
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full border border-stone-300"
                          style={colorSwatchStyle(color.hex)}
                        />
                        {color.name}
                      </button>
                    ))}
                </div>

                {!showCustomColorForm[pi] ? (
                  <button
                    type="button"
                    onClick={() =>
                      setShowCustomColorForm((prev) => ({
                        ...prev,
                        [pi]: true,
                      }))
                    }
                    className="mt-3 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm transition-colors hover:border-stone-400 hover:bg-stone-50"
                  >
                    Adicionar mais cores
                  </button>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-stone-300 bg-stone-50/80 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                        Adicionar outra cor
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setShowCustomColorForm((prev) => ({
                            ...prev,
                            [pi]: false,
                          }))
                        }
                        className="text-[11px] font-medium text-stone-500 hover:text-stone-800"
                      >
                        Fechar
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="min-w-0 flex-1">
                        <span className="mb-1 block text-[11px] font-medium text-stone-600">
                          Nome
                        </span>
                        <input
                          type="text"
                          value={customColorDraft[pi]?.name ?? ""}
                          onChange={(e) =>
                            updateCustomColorDraft(pi, "name", e.target.value)
                          }
                          placeholder="Ex.: Azul Marinho"
                          className={INPUT_CLASS}
                        />
                      </label>
                      <label className="w-full sm:w-40">
                        <span className="mb-1 block text-[11px] font-medium text-stone-600">
                          Número da cor
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-9 w-9 shrink-0 rounded-full border border-stone-300 shadow-sm"
                            style={colorSwatchStyle(
                              normalizeHexColor(
                                customColorDraft[pi]?.hex ?? ""
                              ) ?? undefined
                            )}
                            title="Prévia da cor"
                          />
                          <input
                            type="text"
                            value={customColorDraft[pi]?.hex ?? ""}
                            onChange={(e) =>
                              updateCustomColorDraft(pi, "hex", e.target.value)
                            }
                            placeholder="#FFFFFF"
                            className={INPUT_CLASS}
                          />
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() => addCustomColor(pi)}
                        disabled={
                          !(customColorDraft[pi]?.name ?? "").trim() ||
                          !normalizeHexColor(customColorDraft[pi]?.hex ?? "")
                        }
                        className="rounded-lg border border-stone-900 bg-stone-900 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Adicionar
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-stone-500">
                      Use o código hexadecimal (ex.: #FF5733). A bolinha atualiza
                      ao digitar.
                    </p>
                  </div>
                )}
              </div>

              {piece.sizes.length > 0 && piece.colors.length === 0 && (
                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
                  <p className="border-b border-stone-100 bg-stone-50 px-3 py-2.5 text-xs font-semibold text-stone-800">
                    Quantidade em estoque por tamanho
                  </p>
                  <table className="w-full min-w-[200px] border-collapse text-center text-xs">
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="border-b border-r border-stone-100 bg-stone-50/90 p-2 text-left font-medium text-stone-500"
                        >
                          Tamanho
                        </th>
                        <th
                          scope="col"
                          className="border-b border-stone-100 p-2 font-medium text-stone-800"
                        >
                          Qtd.
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {piece.sizes.map((s) => {
                        const cell = piece.variants.find(
                          (v) =>
                            isSizeOnlyColorName(v.colorName) &&
                            v.sizeName === s.name
                        );
                        return (
                          <tr key={s.name}>
                            <th
                              scope="row"
                              className="border-b border-r border-stone-100 bg-stone-50/80 p-2 text-left font-medium text-stone-800"
                            >
                              {s.name}
                            </th>
                            <td className="border-b border-stone-50 p-1.5">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                aria-label={`Quantidade ${piece.name || "peça"} ${s.name}`}
                                className="w-full max-w-[4.5rem] rounded-md border border-stone-300 bg-white px-1 py-1.5 text-center text-sm font-medium tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                                value={cell?.quantity ?? "0"}
                                onChange={(e) =>
                                  updateVariantQty(
                                    pi,
                                    SIZE_ONLY_COLOR_NAME,
                                    s.name,
                                    e.target.value
                                  )
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {piece.colors.length > 0 && piece.sizes.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
                  <p className="border-b border-stone-100 bg-stone-50 px-3 py-2.5 text-xs font-semibold text-stone-800">
                    Quantidade em estoque (cor × tamanho)
                  </p>
                  <table className="w-full min-w-[240px] border-collapse text-center text-xs">
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="border-b border-r border-stone-100 bg-stone-50/90 p-2 text-left font-medium text-stone-500"
                        >
                          Tamanho / Cor
                        </th>
                        {piece.colors.map((c) => (
                          <th
                            key={c.name}
                            scope="col"
                            className="border-b border-stone-100 p-2 font-medium text-stone-800"
                          >
                            <span className="inline-flex flex-col items-center gap-1">
                              <span
                                className="h-3 w-3 rounded-full border border-stone-200"
                                style={colorSwatchStyle(c.hex)}
                              />
                              {c.name}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {piece.sizes.map((s) => (
                        <tr key={s.name}>
                          <th
                            scope="row"
                            className="border-b border-r border-stone-100 bg-stone-50/80 p-2 text-left font-medium text-stone-800"
                          >
                            {s.name}
                          </th>
                          {piece.colors.map((c) => {
                            const cell = piece.variants.find(
                              (v) =>
                                v.colorName === c.name && v.sizeName === s.name
                            );
                            return (
                              <td
                                key={`${c.name}-${s.name}`}
                                className="border-b border-stone-50 p-1.5"
                              >
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  inputMode="numeric"
                                  aria-label={`Quantidade ${piece.name || "peça"} ${c.name} ${s.name}`}
                                  className="w-full max-w-[4.5rem] rounded-md border border-stone-300 bg-white px-1 py-1.5 text-center text-sm font-medium tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                                  value={cell?.quantity ?? "0"}
                                  onChange={(e) =>
                                    updateVariantQty(
                                      pi,
                                      c.name,
                                      s.name,
                                      e.target.value
                                    )
                                  }
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      </div>

      <div className="flex shrink-0 justify-end border-t border-stone-200 bg-white px-4 py-4 sm:px-6">
        <button
          type="submit"
          disabled={loading || images.length === 0}
          className="rounded-lg bg-stone-900 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 disabled:opacity-50"
        >
          {loading
            ? "Salvando..."
            : isEditing
              ? "Atualizar Produto"
              : "Cadastrar Produto"}
        </button>
      </div>
    </form>
  );
}
