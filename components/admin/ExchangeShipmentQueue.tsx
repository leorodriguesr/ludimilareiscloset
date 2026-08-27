"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";

type QueueStatus =
  | "needs_label"
  | "to_pack"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled";

type ExchangeShipment = {
  id: string;
  exchangeId: string;
  exchangeNumber: number | null;
  orderNumber: number | null;
  recipientName: string | null;
  email: string | null;
  items: { id: string; productName: string; quantity: number }[];
  shippingServiceName: string | null;
  shippingServiceId: number | null;
  trackingCode: string | null;
  labelUrl: string | null;
  quotedPrice: number | null;
  queueStatus: QueueStatus;
};

const QUEUE_LABELS: Record<QueueStatus, string> = {
  needs_label: "Gerar etiqueta",
  to_pack: "Por embalar",
  packed: "Por enviar",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export function ExchangeShipmentQueue({
  filter,
}: {
  filter: QueueStatus | null;
}) {
  const [shipments, setShipments] = useState<ExchangeShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/exchange-shipments");
      const data = (await res.json()) as { shipments?: ExchangeShipment[] };
      setShipments(Array.isArray(data.shipments) ? data.shipments : []);
    } catch {
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter) return shipments.filter((s) => s.queueStatus === filter);
    return shipments.filter((s) =>
      ["needs_label", "to_pack", "packed"].includes(s.queueStatus)
    );
  }, [filter, shipments]);

  if (loading || visible.length === 0) return null;

  async function generateLabel(row: ExchangeShipment) {
    setBusyId(row.id);
    try {
      await fetch(`/api/admin/exchanges/${row.exchangeId}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "OUTBOUND",
          serviceId: row.shippingServiceId,
        }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function markPacked(row: ExchangeShipment) {
    setBusyId(row.id);
    try {
      await fetch(`/api/admin/exchange-shipments/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippingStatus: "packed" }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-sky-200 bg-sky-50/40">
      <div className="border-b border-sky-100 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">
          Reenvios de troca
        </p>
      </div>
      <ul className="divide-y divide-sky-100 bg-white">
        {visible.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium text-stone-900">
                Troca #{row.exchangeNumber ?? row.exchangeId.slice(0, 6)} ·
                pedido {row.orderNumber != null ? `#${row.orderNumber}` : "—"}
              </p>
              <p className="truncate text-xs text-stone-500">
                {row.recipientName || row.email || "Cliente"} ·{" "}
                {row.items.map((i) => i.productName).join(", ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-stone-500">
                {QUEUE_LABELS[row.queueStatus]}
                {row.quotedPrice != null ? ` · ${formatPrice(row.quotedPrice)}` : ""}
              </span>
              {row.trackingCode ? (
                <span className="font-mono text-xs">{row.trackingCode}</span>
              ) : null}
              {row.queueStatus === "needs_label" ? (
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void generateLabel(row)}
                  className="rounded-md bg-stone-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                >
                  Gerar etiqueta
                </button>
              ) : null}
              {row.queueStatus === "to_pack" ? (
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void markPacked(row)}
                  className="rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-700 disabled:opacity-40"
                >
                  Embalado
                </button>
              ) : null}
              {row.labelUrl ? (
                <a
                  href={row.labelUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-stone-200 px-2.5 py-1 text-xs"
                >
                  PDF
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
