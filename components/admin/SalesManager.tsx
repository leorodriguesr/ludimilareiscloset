"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import type { CartPieceSelection } from "@/lib/cart/types";

/* ─── Tipos ───────────────────────────────────────────────────────── */

type OrderProduct = {
  id: string;
  name: string;
  images: { url: string }[];
};

type OrderItem = {
  id: string;
  quantity: number;
  price: number;
  pieceSelectionsJson: string | null;
  product: OrderProduct;
};

type AdminOrder = {
  id: string;
  orderNumber: number | null;
  email: string;
  status: string;
  total: number;
  shippingAmount: number;
  shippingServiceName: string | null;
  destinationCep: string | null;
  recipientName: string | null;
  phone: string | null;
  cpf: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  paidAt: string | null;
  paymentCaptureMethod: string | null;
  shippingStatus: string;
  superfreteStatus: string | null;
  trackingCode: string | null;
  superfreteShipmentId: string | null;
  labelUrl: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  user: { name: string; email: string; phone: string } | null;
  items: OrderItem[];
};

type ApiResponse = { orders: AdminOrder[]; total: number; page: number; limit: number };
type FilterKey = "all" | "paid" | "waiting";

/* ─── Helpers ─────────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
}
function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function fmtFull(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
}

function elapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d !== 1 ? "s" : ""}`;
}

function paymentMethodLabel(method: string | null): string {
  if (!method) return "—";
  const m = method.toLowerCase();
  if (m.includes("pix")) return "Pix";
  if (m.includes("credit") || m.includes("credito") || m.includes("crédito")) return "Cartão crédito";
  if (m.includes("debit") || m.includes("debito") || m.includes("débito")) return "Cartão débito";
  if (m.includes("boleto")) return "Boleto";
  return method;
}

function parsePieces(json: string | null): CartPieceSelection[] {
  try { return json ? (JSON.parse(json) as CartPieceSelection[]) : []; } catch { return []; }
}

function cpfDisplay(v: string | null): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return v;
}
function cepDisplay(v: string | null): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0,5)}-${d.slice(5)}` : v;
}

function hasOrderAddress(order: AdminOrder): boolean {
  return Boolean(
    order.addressStreet ||
    order.addressNumber ||
    order.addressComplement ||
    order.addressNeighborhood ||
    order.addressCity ||
    order.addressState ||
    order.destinationCep
  );
}

function displayOrDash(v: string | null | undefined): string {
  const t = v?.trim();
  return t ? t : "—";
}

const SHIPPING_STATUS = [
  { value: "to_pack",    label: "Por embalar", dot: "bg-amber-400"   },
  { value: "packed",     label: "Embalado",    dot: "bg-blue-500"    },
  { value: "shipped",    label: "Enviado",     dot: "bg-emerald-500" },
  { value: "delivered",  label: "Entregue",    dot: "bg-teal-500"    },
  { value: "cancelled",  label: "Cancelado",   dot: "bg-red-400"     },
] as const;
function sInfo(v: string) { return SHIPPING_STATUS.find((s) => s.value === v) ?? SHIPPING_STATUS[0]; }

function payBadge(order: AdminOrder) {
  if (order.paidAt) return { label: "Pago", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  return { label: "Aguardando", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
}

function Chip({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>{label}</span>;
}

/* ─── Linha expandida ─────────────────────────────────────────────── */

function ExpandedRow({
  order,
  colSpan,
  onRefresh,
  muted = false,
}: {
  order: AdminOrder;
  colSpan: number;
  onRefresh: () => void;
  muted?: boolean;
}) {
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [generatingLabel, setGeneratingLabel] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isCancelled = order.status === "cancelled";
  const hasActiveLabel = Boolean(order.labelUrl || order.superfreteShipmentId);

  async function updateShippingStatus(v: string) {
    setUpdatingStatus(true);
    try {
      await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippingStatus: v }),
      });
      onRefresh();
    } finally { setUpdatingStatus(false); }
  }

  async function generateLabel() {
    setGeneratingLabel(true); setLabelError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as { labelUrl?: string; error?: string };
      if (!res.ok) { setLabelError(data.error ?? "Erro ao gerar etiqueta."); return; }
      window.open(`/api/admin/orders/${order.id}/label/pdf`, "_blank");
      onRefresh();
    } catch { setLabelError("Erro de conexão."); }
    finally { setGeneratingLabel(false); }
  }

  async function cancelSale() {
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError("Informe o motivo do cancelamento.");
      return;
    }

    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = (await res.json()) as { error?: string; labelCancelled?: boolean };
      if (!res.ok) {
        setCancelError(data.error ?? "Erro ao cancelar venda.");
        return;
      }
      setShowCancelForm(false);
      setCancelReason("");
      onRefresh();
    } catch {
      setCancelError("Erro de conexão.");
    } finally {
      setCancelling(false);
    }
  }

  const customerName = order.recipientName || order.user?.name || order.email.split("@")[0];
  const customerPhone = order.phone || order.user?.phone || null;
  const customerEmail = order.email;
  const customerCpf = order.cpf;

  const pb = payBadge(order);

  return (
    <tr className={muted ? "opacity-45" : undefined}>
      <td colSpan={colSpan} className="border-b border-stone-200 bg-stone-50/80 px-5 pb-6 pt-1">
        <div className="grid gap-5 pt-4 lg:grid-cols-[1fr_340px]">

          {/* Produtos */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Produtos</p>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                    <th className="py-2.5 pl-4 pr-2 text-left">Produto</th>
                    <th className="px-2 py-2.5 text-center">Qtd</th>
                    <th className="px-2 py-2.5 text-right">Unit.</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {order.items.map((item) => {
                    const pieces = parsePieces(item.pieceSelectionsJson);
                    const img = item.product.images[0]?.url ?? null;
                    return (
                      <tr key={item.id}>
                        <td className="py-3 pl-4 pr-2">
                          <div className="flex items-center gap-3">
                            <div className="relative h-12 w-10 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                              {img
                                ? <Image src={img} alt="" fill className="object-cover" sizes="40px" />
                                : <div className="flex h-full items-center justify-center text-[9px] text-stone-300">—</div>}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-stone-900 leading-snug">{item.product.name}</p>
                              {pieces.length > 0 && (
                                <p className="mt-0.5 text-xs text-stone-400">
                                  {pieces.map((p) => [p.pieceName, p.color, p.size].filter(Boolean).join(" · ")).join(" / ")}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center text-stone-600">{item.quantity}</td>
                        <td className="px-2 py-3 text-right tabular-nums text-stone-600">{formatPrice(item.price)}</td>
                        <td className="py-3 pl-2 pr-4 text-right tabular-nums font-semibold text-stone-900">{formatPrice(item.price * item.quantity)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-stone-100 bg-stone-50">
                    <td colSpan={3} className="py-2.5 pl-4 pr-2 text-xs font-semibold uppercase tracking-widest text-stone-400">Total</td>
                    <td className="py-2.5 pl-2 pr-4 text-right tabular-nums font-bold text-stone-900">{formatPrice(order.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Coluna direita */}
          <div className="space-y-4">

            {/* Dados da cliente */}
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Dados da cliente</p>
              <dl className="space-y-2 text-sm">
                <DetailRow label="Nome" value={customerName} />
                <DetailRow label="E-mail" value={customerEmail} />
                <DetailRow label="Telefone" value={customerPhone ?? "—"} />
                <DetailRow label="CPF" value={cpfDisplay(customerCpf)} />
              </dl>
            </div>

            {/* Endereço de entrega */}
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Endereço de entrega</p>
              {hasOrderAddress(order) ? (
                <dl className="space-y-2 text-sm">
                  <DetailRow label="Logradouro" value={displayOrDash(order.addressStreet)} />
                  <DetailRow label="Número" value={displayOrDash(order.addressNumber)} />
                  <DetailRow label="Complemento" value={displayOrDash(order.addressComplement)} />
                  <DetailRow label="Bairro" value={displayOrDash(order.addressNeighborhood)} />
                  <DetailRow label="Cidade" value={displayOrDash(order.addressCity)} />
                  <DetailRow label="Estado" value={displayOrDash(order.addressState)} />
                  <DetailRow label="CEP" value={cepDisplay(order.destinationCep)} />
                </dl>
              ) : (
                <p className="text-sm text-stone-400">Endereço não informado</p>
              )}
              {order.shippingServiceName && (
                <p className="mt-3 border-t border-stone-100 pt-2 text-xs text-stone-500">
                  <span className="font-medium">Serviço:</span> {order.shippingServiceName}
                  {" · "}{order.shippingAmount > 0 ? formatPrice(order.shippingAmount) : "Grátis"}
                </p>
              )}
            </div>

            {/* Pagamento */}
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Pagamento</p>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-stone-500">Status</dt>
                  <dd className="flex flex-col items-end gap-1">
                    <Chip label={pb.label} cls={pb.cls} />
                    {isCancelled && (
                      <span className="text-[11px] font-medium text-red-600">Venda cancelada</span>
                    )}
                  </dd>
                </div>
                {order.paidAt && <DetailRow label="Pago em" value={fmtFull(order.paidAt)} />}
                <DetailRow label="Método" value={paymentMethodLabel(order.paymentCaptureMethod)} />
                {isCancelled && order.cancelledAt && (
                  <DetailRow label="Cancelado em" value={fmtFull(order.cancelledAt)} />
                )}
                {isCancelled && order.cancellationReason && (
                  <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <span className="font-medium">Motivo:</span> {order.cancellationReason}
                  </div>
                )}
              </dl>
            </div>

            {/* Ações de envio (só pedidos pagos e não cancelados) */}
            {order.paidAt && !isCancelled && (
              <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Status de envio</p>
                <select
                  className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-50"
                  value={order.shippingStatus}
                  disabled={updatingStatus}
                  onChange={(e) => updateShippingStatus(e.target.value)}
                >
                  {SHIPPING_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {order.trackingCode && (
                  <p className="text-xs text-stone-500">
                    Rastreio: <span className="font-mono">{order.trackingCode}</span>
                  </p>
                )}
                {order.labelUrl ? (
                  <a href={`/api/admin/orders/${order.id}/label/pdf`} target="_blank" rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Baixar etiqueta
                  </a>
                ) : (
                  <button type="button" disabled={generatingLabel} onClick={generateLabel}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 transition-colors disabled:opacity-50">
                    {generatingLabel
                      ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Gerando…</>
                      : <>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                          </svg>
                          Gerar etiqueta
                        </>}
                  </button>
                )}
                {labelError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{labelError}</p>
                )}
              </div>
            )}

            {!isCancelled && (
              <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-red-700">
                  Cancelar venda
                </p>
                {!showCancelForm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCancelForm(true);
                      setCancelError(null);
                    }}
                    className="flex w-full items-center justify-center rounded-lg border border-red-200 bg-white py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                  >
                    Cancelar venda
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor={`cancel-reason-${order.id}`}
                        className="mb-1.5 block text-xs font-medium text-stone-700"
                      >
                        Motivo do cancelamento
                      </label>
                      <textarea
                        id={`cancel-reason-${order.id}`}
                        rows={3}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Ex.: cliente desistiu, pagamento duplicado, endereço inválido…"
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-red-300"
                      />
                    </div>
                    {hasActiveLabel && (
                      <p className="text-xs text-red-700">
                        Este pedido possui etiqueta gerada. Ela será cancelada na SuperFrete também.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={cancelling}
                        onClick={() => void cancelSale()}
                        className="flex-1 rounded-lg bg-red-700 py-2 text-sm font-medium text-white hover:bg-red-800 transition-colors disabled:opacity-50"
                      >
                        {cancelling ? "Cancelando…" : "Confirmar cancelamento"}
                      </button>
                      <button
                        type="button"
                        disabled={cancelling}
                        onClick={() => {
                          setShowCancelForm(false);
                          setCancelReason("");
                          setCancelError(null);
                        }}
                        className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                )}
                {cancelError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {cancelError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-stone-500">{label}</dt>
      <dd className="text-right text-stone-800 break-all">{value}</dd>
    </div>
  );
}

/* ─── Componente principal ────────────────────────────────────────── */

export function SalesManager() {
  const [orders, setOrders]       = useState<AdminOrder[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<FilterKey>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMsg, setBulkMsg]         = useState<string | null>(null);
  const allRef = useRef<HTMLInputElement>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true); setSelectedIds(new Set()); setExpandedIds(new Set());
    try {
      const qs = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/orders${qs}`);
      const data = (await res.json()) as ApiResponse;
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    if (!allRef.current) return;
    const n = selectedIds.size;
    allRef.current.indeterminate = n > 0 && n < orders.length;
    allRef.current.checked = n === orders.length && orders.length > 0;
  }, [selectedIds, orders.length]);

  const toggleExpand = (id: string) =>
    setExpandedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelect = (id: string) =>
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelectedIds(selectedIds.size === orders.length ? new Set() : new Set(orders.map((o) => o.id)));

  async function bulkShipping(status: string, label: string) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkLoading(true); setBulkMsg(null);
    try {
      await Promise.all(ids.map((id) =>
        fetch(`/api/admin/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shippingStatus: status }),
        })
      ));
      setBulkMsg(`${ids.length} pedido(s) marcado(s) como "${label}".`);
      await fetchOrders();
    } finally { setBulkLoading(false); }
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all",     label: "Todas" },
    { key: "paid",    label: "Pagas" },
    { key: "waiting", label: "Aguardando pagamento" },
  ];

  const paidOrders = orders.filter((o) => o.paidAt);
  const paidTotal  = paidOrders.reduce((s, o) => s + o.total, 0);
  const toPackCount = paidOrders.filter((o) => o.shippingStatus === "to_pack").length;

  const COL_COUNT = 8;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Vendas</h2>
          <p className="mt-0.5 text-sm text-stone-500">{total} pedido{total !== 1 ? "s" : ""}</p>
        </div>
        <button type="button" onClick={fetchOrders} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50">
          <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Atualizar
        </button>
      </div>

      {/* Cards resumo */}
      {!loading && filter === "all" && orders.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Pedidos pagos",  val: String(paidOrders.length) },
            { label: "Receita",        val: formatPrice(paidTotal) },
            { label: "Ticket médio",   val: paidOrders.length > 0 ? formatPrice(paidTotal / paidOrders.length) : "—" },
            { label: "Por embalar",    val: String(toPackCount) },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">{label}</p>
              <p className="mt-1 text-xl font-semibold text-stone-900">{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setFilter(key)}
            className={`rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Barra de ações em massa */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-stone-700">{selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}</span>
          <div className="ml-2 flex flex-wrap gap-2">
            <BulkBtn onClick={() => bulkShipping("to_pack",  "Por embalar")} disabled={bulkLoading}>Por embalar</BulkBtn>
            <BulkBtn onClick={() => bulkShipping("packed",   "Embalado")}   disabled={bulkLoading} cls="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">Marcar embalado</BulkBtn>
            <BulkBtn onClick={() => bulkShipping("shipped",  "Enviado")}    disabled={bulkLoading} cls="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Marcar enviado</BulkBtn>
          </div>
          {bulkLoading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />}
          {bulkMsg && <span className="text-xs text-stone-500">{bulkMsg}</span>}
        </div>
      )}

      {/* Estado vazio / loading */}
      {loading ? (
        <div className="flex items-center gap-2.5 py-10 text-sm text-stone-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
          Carregando pedidos…
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 py-14 text-center">
          <p className="text-sm text-stone-500">
            {filter === "waiting" ? "Nenhum pedido aguardando pagamento."
              : filter === "paid" ? "Nenhum pedido pago encontrado."
              : "Nenhuma venda encontrada."}
          </p>
        </div>
      ) : (
        /* ─── Tabela ─── */
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                <th className="w-10 px-4 py-3">
                  <input ref={allRef} type="checkbox" aria-label="Selecionar todos"
                    className="h-4 w-4 rounded border-stone-300 accent-stone-900" onChange={toggleAll} />
                </th>
                <th className="px-3 py-3 text-left">Pedido</th>
                <th className="px-3 py-3 text-left">Data</th>
                <th className="px-3 py-3 text-left">Cliente</th>
                <th className="px-3 py-3 text-left">Pagamento</th>
                <th className="px-3 py-3 text-center">Produtos</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3 text-left">Envio</th>
                <th className="w-8 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const isExpanded = expandedIds.has(order.id);
                const isSelected = selectedIds.has(order.id);
                const isSaleCancelled = order.status === "cancelled";
                const pb = payBadge(order);
                const ss = sInfo(order.shippingStatus);
                const totalUnits = order.items.reduce((s, i) => s + i.quantity, 0);
                const customerName = order.recipientName || order.user?.name || order.email.split("@")[0];
                const rowMuted = isSaleCancelled
                  ? "opacity-45 pointer-events-auto"
                  : "";

                return (
                  <Fragment key={order.id}>
                    <tr
                      className={`border-b border-stone-100 transition-colors ${rowMuted} ${
                        isSaleCancelled
                          ? "bg-stone-50/60"
                          : isExpanded
                            ? "bg-stone-50"
                            : "hover:bg-stone-50/60"
                      } ${isSelected && !isSaleCancelled ? "bg-stone-100" : ""}`}>

                      {/* Checkbox */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(order.id)}
                          className="h-4 w-4 rounded border-stone-300 accent-stone-900" />
                      </td>

                      {/* # Pedido */}
                      <td className="cursor-pointer px-3 py-3" onClick={() => toggleExpand(order.id)}>
                        <span className="font-mono font-semibold text-stone-900">
                          #{order.orderNumber ?? "—"}
                        </span>
                      </td>

                      {/* Data — data em cima, hora embaixo */}
                      <td className="cursor-pointer px-3 py-3" onClick={() => toggleExpand(order.id)}>
                        <p className="font-medium text-stone-700">{fmtDate(order.createdAt)}</p>
                        <p className="text-xs text-stone-400">{fmtTime(order.createdAt)}</p>
                      </td>

                      {/* Cliente — só nome */}
                      <td className="cursor-pointer px-3 py-3" onClick={() => toggleExpand(order.id)}>
                        <p className="font-medium text-stone-900 truncate max-w-[140px]">{customerName}</p>
                      </td>

                      {/* Pagamento: status + método + tempo (se aguardando) */}
                      <td className="cursor-pointer px-3 py-3" onClick={() => toggleExpand(order.id)}>
                        <div className="flex flex-col gap-1">
                          <Chip label={pb.label} cls={pb.cls} />
                          {isSaleCancelled && (
                            <span className="text-[11px] font-medium text-red-600">Venda cancelada</span>
                          )}
                          <span className="text-xs text-stone-400">{paymentMethodLabel(order.paymentCaptureMethod)}</span>
                          {!order.paidAt && !isSaleCancelled && (
                            <span className="text-[11px] text-stone-400 italic">{elapsed(order.createdAt)}</span>
                          )}
                        </div>
                      </td>

                      {/* Produtos */}
                      <td className="cursor-pointer px-3 py-3 text-center" onClick={() => toggleExpand(order.id)}>
                        <p className="font-medium text-stone-900">{order.items.length} {order.items.length === 1 ? "item" : "itens"}</p>
                        <p className="text-xs text-stone-400">{totalUnits} unid.</p>
                      </td>

                      {/* Total */}
                      <td className="cursor-pointer px-3 py-3 text-right" onClick={() => toggleExpand(order.id)}>
                        <span className="font-semibold tabular-nums text-stone-900">{formatPrice(order.total)}</span>
                      </td>

                      {/* Envio */}
                      <td className="cursor-pointer px-3 py-3" onClick={() => toggleExpand(order.id)}>
                        {isSaleCancelled ? (
                          <span className="text-xs text-stone-400">—</span>
                        ) : order.paidAt ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full ${ss.dot}`} />
                              <span className="text-stone-700">{ss.label}</span>
                            </div>
                            {order.shippingServiceName && (
                              <span className="text-xs text-stone-400 truncate max-w-[130px]">{order.shippingServiceName}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>

                      {/* Chevron */}
                      <td className="cursor-pointer px-3 py-3" onClick={() => toggleExpand(order.id)}>
                        <svg className={`mx-auto h-4 w-4 text-stone-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </td>
                    </tr>

                    {isExpanded && (
                      <ExpandedRow
                        order={order}
                        colSpan={COL_COUNT + 1}
                        onRefresh={fetchOrders}
                        muted={isSaleCancelled}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BulkBtn({ onClick, disabled, children, cls }: {
  onClick: () => void; disabled: boolean;
  children: React.ReactNode; cls?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${cls ?? "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"}`}>
      {children}
    </button>
  );
}
