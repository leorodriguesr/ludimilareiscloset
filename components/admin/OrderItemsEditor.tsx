"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { PERMISSION } from "@/lib/auth/permissions";
import { PieceSelector } from "@/components/product/PieceSelector";
import { CUSTOM_SET_SIZES } from "@/components/admin/CustomSaleSetsForm";
import {
  CustomSaleSetsForm,
  type CustomSaleSetInput,
} from "@/components/admin/CustomSaleSetsForm";
import { ProductSearchSelect } from "@/components/admin/ProductSearchSelect";
import { formatPrice } from "@/lib/format";
import type { CartPieceSelection } from "@/lib/cart/types";
import type { Product } from "@/lib/types";
import {
  buildCartPieceSelections,
  emptyPieceSelections,
  pieceSelectionMapFromCart,
  pieceSelectionsAreComplete,
  type PieceSelectionMap,
} from "@/lib/product-piece-selection";
import { parsePieceSelections } from "@/lib/exchanges/serialize";
import {
  orderItemDisplayImageUrl,
  orderItemDisplayName,
} from "@/lib/orders/order-item-display";

export type EditableOrderItem = {
  id: string;
  quantity: number;
  price: number;
  pieceSelectionsJson: string | null;
  productId?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  productImageUrl?: string | null;
  paymentStatus?: string | null;
  product: {
    id: string;
    name: string;
    description?: string | null;
    images: { url: string }[];
  } | null;
};

type CatalogDraft = {
  product: Product;
  quantity: number;
  unitPrice: number;
  selections: PieceSelectionMap;
};

function PencilIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}

function canMutateItems(order: {
  status: string;
  orderSource?: string;
  labelUrl: string | null;
  superfreteShipmentId: string | null;
  shippingStatus: string;
}): boolean {
  if (order.orderSource !== "ADMIN_SALE") return false;
  if (order.status === "cancelled" || order.status === "expired") return false;
  if (order.labelUrl || order.superfreteShipmentId) return false;
  if (order.shippingStatus === "shipped" || order.shippingStatus === "delivered") {
    return false;
  }
  return order.status === "pending_payment" || order.status === "paid";
}

function itemToApiLine(item: EditableOrderItem) {
  const pieces = parsePieceSelections(item.pieceSelectionsJson);
  if (!item.productId) {
    return {
      kind: "custom" as const,
      description: orderItemDisplayName(item),
      pieces: pieces.map((p) => ({
        name: p.pieceName,
        size: p.size ?? "",
        color: p.color ?? "",
      })),
      unitPrice: item.price,
      quantity: item.quantity,
    };
  }
  return {
    kind: "catalog" as const,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.price,
    pieceSelections: pieces,
  };
}

export function OrderItemsEditor({
  order,
  products,
  ensureProducts,
  onRefresh,
}: {
  order: {
    id: string;
    status: string;
    orderSource?: string;
    labelUrl: string | null;
    superfreteShipmentId: string | null;
    shippingStatus: string;
    paymentMethod?: string | null;
    paidAt?: string | null;
    items: EditableOrderItem[];
  };
  products: Product[];
  ensureProducts: () => Promise<Product[]>;
  onRefresh: () => void;
}) {
  const { hasPermission } = useAuth();
  const canMarkPaid = hasPermission(PERMISSION.ADMIN_SALE_MARK_PAID);
  const mutable = canMutateItems(order);
  const paidLocked = order.status === "paid";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showCustomSets, setShowCustomSets] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft | null>(null);
  const [editingPiecesId, setEditingPiecesId] = useState<string | null>(null);
  const [pieceProduct, setPieceProduct] = useState<Product | null>(null);
  const [pieceSelections, setPieceSelections] = useState<PieceSelectionMap>({});
  const [customDraft, setCustomDraft] = useState<CartPieceSelection[]>([]);
  const [savingPieces, setSavingPieces] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [editUnitPrice, setEditUnitPrice] = useState("");

  const pendingItems = order.items.filter(
    (item) => (item.paymentStatus ?? "pending") !== "paid"
  );

  function closeAddPanel() {
    setAdding(false);
    setShowCustomSets(false);
    setCatalogDraft(null);
  }

  async function persistLines(lines: unknown[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível atualizar os itens.");
        return false;
      }
      closeAddPanel();
      onRefresh();
      return true;
    } catch {
      setError("Erro de conexão.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function currentPersistableItems(): EditableOrderItem[] {
    return paidLocked ? pendingItems : order.items;
  }

  async function addLines(newLines: unknown[]) {
    await persistLines([...currentPersistableItems().map(itemToApiLine), ...newLines]);
  }

  async function markPendingItemsPaid() {
    const count = pendingItems.length;
    const confirmed = window.confirm(
      count === 1
        ? "Confirmar que esta peça foi paga? O acréscimo entra no caixa e a etiqueta pode ser gerada."
        : `Confirmar pagamento das ${count} peças em aberto? O acréscimo entra no caixa e a etiqueta pode ser gerada.`
    );
    if (!confirmed) return;
    setMarkingPaid(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sales/${order.id}/mark-paid`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Não foi possível confirmar o pagamento da peça.");
        return;
      }
      onRefresh();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setMarkingPaid(false);
    }
  }

  async function deleteItem(item: EditableOrderItem) {
    const remaining = currentPersistableItems().filter((row) => row.id !== item.id);
    if (!paidLocked && remaining.length === 0) {
      setError("A venda precisa ter pelo menos um item.");
      return;
    }
    const confirmed = window.confirm(
      "Remover esta peça da venda? Um novo link de pagamento será gerado."
    );
    if (!confirmed) return;
    setDeletingId(item.id);
    try {
      await persistLines(remaining.map(itemToApiLine));
    } finally {
      setDeletingId(null);
    }
  }

  async function startAdd() {
    setError(null);
    setAdding(true);
    setShowCustomSets(false);
    setCatalogDraft(null);
    await ensureProducts();
  }

  function pickCatalogProduct(product: Product) {
    const usePix = order.paymentMethod === "pix";
    const unit =
      usePix && product.pixPrice != null ? product.pixPrice : product.price;
    setShowCustomSets(false);
    setCatalogDraft({
      product,
      quantity: 1,
      unitPrice: unit,
      selections: emptyPieceSelections(product.pieces),
    });
  }

  async function confirmCatalogDraft() {
    if (!catalogDraft) return;
    if (
      catalogDraft.product.pieces.length > 0 &&
      !pieceSelectionsAreComplete(catalogDraft.product.pieces, catalogDraft.selections)
    ) {
      setError("Selecione cor e tamanho de cada peça.");
      return;
    }
    await addLines([
      {
        kind: "catalog",
        productId: catalogDraft.product.id,
        quantity: catalogDraft.quantity,
        unitPrice: catalogDraft.unitPrice,
        pieceSelections: buildCartPieceSelections(
          catalogDraft.product.pieces,
          catalogDraft.selections
        ),
      },
    ]);
  }

  async function handleCustomSetsAdded(sets: CustomSaleSetInput[]) {
    await addLines(
      sets.map((set) => ({
        kind: "custom",
        description: set.description,
        pieces: set.pieces,
        unitPrice: set.unitPrice,
        quantity: 1,
      }))
    );
  }

  function cancelEditItem() {
    setEditingPiecesId(null);
    setPieceProduct(null);
    setCustomDraft([]);
    setEditUnitPrice("");
  }

  async function persistPieceSelections(
    item: EditableOrderItem,
    nextSelections: CartPieceSelection[]
  ) {
    setSavingPieces(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/orders/${order.id}/items/${item.id}/piece-selections`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pieceSelections: nextSelections }),
        }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erro ao salvar cor/tamanho.");
        return;
      }
      setEditingPiecesId(null);
      setPieceProduct(null);
      setCustomDraft([]);
      setEditUnitPrice("");
      onRefresh();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSavingPieces(false);
    }
  }

  async function startEditItem(item: EditableOrderItem) {
    const pieces = parsePieceSelections(item.pieceSelectionsJson);
    setError(null);
    setEditUnitPrice(String(item.price));
    setEditingPiecesId(item.id);
    setCustomDraft(pieces.map((p) => ({ ...p })));
    setPieceProduct(null);
    setPieceSelections({});

    if (!item.productId) return;

    const list = products.length > 0 ? products : await ensureProducts();
    const product = list.find((p) => p.id === item.productId) ?? null;
    if (!product || product.pieces.length === 0) return;
    setPieceProduct(product);
    setPieceSelections(pieceSelectionMapFromCart(product.pieces, pieces));
  }

  async function saveEditedItem(item: EditableOrderItem) {
    const paid = item.paymentStatus === "paid";
    const nextPieces = pieceProduct
      ? buildCartPieceSelections(pieceProduct.pieces, pieceSelections)
      : customDraft;

    if (
      pieceProduct &&
      pieceProduct.pieces.length > 0 &&
      !pieceSelectionsAreComplete(pieceProduct.pieces, pieceSelections)
    ) {
      setError("Selecione cor e tamanho de cada peça.");
      return;
    }

    if (paid) {
      await persistPieceSelections(item, nextPieces);
      return;
    }

    const unitPrice = Number(String(editUnitPrice).replace(",", "."));
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Informe um valor válido.");
      return;
    }

    const valueChanged =
      Math.round(unitPrice * 100) !== Math.round(item.price * 100);

    if (!valueChanged) {
      await persistPieceSelections(item, nextPieces);
      return;
    }

    const updatedLine = !item.productId
      ? {
          kind: "custom" as const,
          description: orderItemDisplayName(item),
          pieces: nextPieces.map((p) => ({
            name: p.pieceName,
            size: p.size ?? "",
            color: p.color ?? "",
          })),
          unitPrice,
          quantity: item.quantity,
        }
      : {
          kind: "catalog" as const,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          pieceSelections: nextPieces,
        };

    const lines = currentPersistableItems().map((row) =>
      row.id === item.id ? updatedLine : itemToApiLine(row)
    );
    const ok = await persistLines(lines);
    if (ok) cancelEditItem();
  }

  function renderItemCard(item: EditableOrderItem) {
    const pieces = parsePieceSelections(item.pieceSelectionsJson);
    const img = orderItemDisplayImageUrl(item);
    const name = orderItemDisplayName(item);
    const paid = item.paymentStatus === "paid";
    const canConfirmItemPaid =
      canMarkPaid && Boolean(order.paidAt) && !paid;
    const isEditingPieces = editingPiecesId === item.id;
    const canDelete = mutable && !paid;
    const canEdit =
      mutable &&
      !isEditingPieces &&
      (!paid || Boolean(item.productId) || pieces.length > 0);
    const valueChanged =
      !paid &&
      Number.isFinite(Number(String(editUnitPrice).replace(",", "."))) &&
      Math.round(Number(String(editUnitPrice).replace(",", ".")) * 100) !==
        Math.round(item.price * 100);

    return (
      <div key={item.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
        <div className="flex gap-3">
          <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100">
            {img ? (
              <Image src={img} alt="" fill className="object-cover" sizes="48px" />
            ) : (
              <div className="flex h-full items-center justify-center text-[9px] text-stone-300">
                —
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium leading-snug text-stone-900">{name}</p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  paid
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {paid ? "Pago" : "Aguardando pagamento"}
              </span>
            </div>
            {!isEditingPieces && pieces.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5 text-xs text-stone-400">
                {pieces.map((p, i) => {
                  const details = [p.pieceName, p.color, p.size]
                    .filter(Boolean)
                    .join(" · ");
                  if (!details) return null;
                  return <li key={`${item.id}-piece-${i}`}>{details}</li>;
                })}
              </ul>
            ) : null}
            <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="text-stone-500">
                {item.quantity}× {formatPrice(item.price)}
              </span>
              <span className="font-semibold tabular-nums text-stone-900">
                {formatPrice(item.price * item.quantity)}
              </span>
            </div>
            {canConfirmItemPaid ? (
              <button
                type="button"
                disabled={markingPaid || saving}
                onClick={() => void markPendingItemsPaid()}
                className="mt-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
              >
                {markingPaid ? "Confirmando…" : "Marcar peça como paga"}
              </button>
            ) : null}
            {canEdit || canDelete ? (
              <div className="mt-0.5 flex items-center justify-end gap-0.5">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void startEditItem(item)}
                    aria-label="Editar peça"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                  >
                    <PencilIcon />
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    disabled={deletingId === item.id || saving}
                    onClick={() => void deleteItem(item)}
                    aria-label="Excluir peça"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {isEditingPieces ? (
          <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/80 p-3">
            {!paid ? (
              <label className="block text-xs font-medium text-stone-500">
                Valor unitário
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editUnitPrice}
                  onChange={(e) => setEditUnitPrice(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
                />
              </label>
            ) : null}
            {pieceProduct ? (
              <PieceSelector
                pieces={pieceProduct.pieces}
                selections={pieceSelections}
                onSelectionsChange={setPieceSelections}
              />
            ) : customDraft.length > 0 ? (
              customDraft.map((piece, index) => {
                const sizeOptions =
                  piece.size &&
                  !(CUSTOM_SET_SIZES as readonly string[]).includes(piece.size)
                    ? [...CUSTOM_SET_SIZES, piece.size]
                    : [...CUSTOM_SET_SIZES];
                return (
                  <div
                    key={`${item.id}-c-${index}`}
                    className="rounded-lg border border-stone-200 bg-white p-3"
                  >
                    <p className="mb-2 text-xs font-semibold">{piece.pieceName}</p>
                    <input
                      value={piece.color ?? ""}
                      onChange={(e) =>
                        setCustomDraft((prev) =>
                          prev.map((row, i) =>
                            i === index
                              ? { ...row, color: e.target.value || null }
                              : row
                          )
                        )
                      }
                      placeholder="Cor"
                      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sizeOptions.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() =>
                            setCustomDraft((prev) =>
                              prev.map((row, i) =>
                                i === index
                                  ? { ...row, size: row.size === size ? null : size }
                                  : row
                              )
                            )
                          }
                          className={`min-w-[2.5rem] rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            piece.size === size
                              ? "bg-stone-900 text-white"
                              : "bg-stone-100 text-stone-600"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelEditItem}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  savingPieces ||
                  saving ||
                  Boolean(
                    pieceProduct &&
                      pieceProduct.pieces.length > 0 &&
                      !pieceSelectionsAreComplete(
                        pieceProduct.pieces,
                        pieceSelections
                      )
                  )
                }
                onClick={() => void saveEditedItem(item)}
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {savingPieces || saving
                  ? "Salvando…"
                  : valueChanged
                    ? "Salvar e gerar novo link"
                    : "Salvar"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-stone-200">
        {order.items.map((item) => renderItemCard(item))}
      </div>

      {mutable && !adding ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void startAdd()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Incluir peça
          </button>
        </div>
      ) : null}

      {mutable && adding ? (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-stone-900">Incluir peça</p>
            <button
              type="button"
              onClick={closeAddPanel}
              className="text-xs font-medium text-stone-500 hover:text-stone-800"
            >
              Cancelar
            </button>
          </div>
          <p className="text-xs text-stone-500">
            Selecione do catálogo ou descreva conjuntos vendidos sem cadastrar produto.
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
            <ProductSearchSelect products={products} onSelect={pickCatalogProduct} />
            <button
              type="button"
              onClick={() => {
                setCatalogDraft(null);
                setShowCustomSets((v) => !v);
              }}
              className={`inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                showCustomSets
                  ? "border-sky-300 bg-sky-100 text-sky-900"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Novo produto
            </button>
          </div>

          {showCustomSets ? (
            <CustomSaleSetsForm
              compact
              onAdd={(sets) => void handleCustomSetsAdded(sets)}
              onCancel={() => setShowCustomSets(false)}
            />
          ) : null}

          {catalogDraft ? (
            <div className="space-y-3 rounded-lg border border-stone-200 p-3">
              <p className="text-sm font-medium text-stone-900">
                {catalogDraft.product.name}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-stone-500">
                  Qtd
                  <input
                    type="number"
                    min={1}
                    value={catalogDraft.quantity}
                    onChange={(e) =>
                      setCatalogDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            }
                          : prev
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-stone-500">
                  Valor unitário
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={catalogDraft.unitPrice}
                    onChange={(e) =>
                      setCatalogDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              unitPrice: Number(e.target.value) || 0,
                            }
                          : prev
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              {catalogDraft.product.pieces.length > 0 ? (
                <PieceSelector
                  pieces={catalogDraft.product.pieces}
                  selections={catalogDraft.selections}
                  onSelectionsChange={(next) =>
                    setCatalogDraft((prev) =>
                      prev ? { ...prev, selections: next } : prev
                    )
                  }
                />
              ) : null}
              <button
                type="button"
                disabled={
                  saving ||
                  (catalogDraft.product.pieces.length > 0 &&
                    !pieceSelectionsAreComplete(
                      catalogDraft.product.pieces,
                      catalogDraft.selections
                    ))
                }
                onClick={() => void confirmCatalogDraft()}
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Adicionar à venda"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
