import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

export type AccountOrderListItem = {
  id: string;
  createdAt: Date;
  status: string;
  total: number;
  shippingAmount: number;
  shippingServiceName: string | null;
  items: {
    id: string;
    quantity: number;
    price: number;
    product: {
      id: string;
      name: string;
      images: { url: string }[];
    };
  }[];
};

function paymentBadgeClass(status: string): string {
  if (status === "paid") return "bg-emerald-100 text-emerald-900";
  if (status === "pending_payment") return "bg-amber-100 text-amber-950";
  return "bg-stone-100 text-stone-800";
}

function paymentLabel(status: string): string {
  if (status === "paid") return "Pago";
  if (status === "pending_payment") return "Aguardando pagamento";
  return status;
}

function shippingExperienceLabel(orderStatus: string): string {
  if (orderStatus !== "paid") {
    return "Após o pagamento";
  }
  return "Em preparação para envio";
}

function formatOrderWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function AccountOrders({ orders }: { orders: AccountOrderListItem[] }) {
  if (orders.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-6 py-12 text-center">
        <p className="text-sm text-stone-600">
          Você ainda não tem pedidos registrados nesta conta.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-stone-900 underline underline-offset-2"
        >
          Ver produtos
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-10 space-y-8">
      {orders.map((order) => (
        <li
          key={order.id}
          className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 bg-stone-50/80 px-4 py-3 sm:px-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">
                Pedido
              </p>
              <p className="font-mono text-sm font-medium text-stone-900">
                {order.id}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                {formatOrderWhen(order.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${paymentBadgeClass(order.status)}`}
              >
                Pagamento: {paymentLabel(order.status)}
              </span>
              <span className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-800">
                Envio: {shippingExperienceLabel(order.status)}
              </span>
            </div>
          </div>

          <ul className="divide-y divide-stone-100">
            {order.items.map((line) => {
              const thumb = line.product.images[0]?.url;
              const lineTotal = line.price * line.quantity;
              return (
                <li
                  key={line.id}
                  className="flex gap-4 px-4 py-4 sm:px-5"
                >
                  <Link
                    href={`/products/${line.product.id}`}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100 ring-1 ring-stone-200/80"
                  >
                    {thumb ? (
                      <Image
                        src={thumb}
                        alt={line.product.name}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] text-stone-400">
                        —
                      </span>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-900 leading-snug">
                      {line.product.name}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {line.quantity}{" "}
                      {line.quantity === 1 ? "unidade" : "unidades"} ×{" "}
                      <span className="tabular-nums text-stone-700">
                        {formatPrice(line.price)}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-stone-900">
                      {formatPrice(lineTotal)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="space-y-2 border-t border-stone-100 px-4 py-4 text-sm sm:px-5">
            {order.shippingAmount > 0 && (
              <div className="flex justify-between gap-4 text-stone-600">
                <span>
                  Frete
                  {order.shippingServiceName
                    ? ` (${order.shippingServiceName})`
                    : ""}
                </span>
                <span className="tabular-nums font-medium text-stone-800">
                  {formatPrice(order.shippingAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4 font-semibold text-stone-900">
              <span>Total</span>
              <span className="tabular-nums">{formatPrice(order.total)}</span>
            </div>
            <Link
              href={`/pedido/${order.id}`}
              className="inline-flex text-sm font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-950"
            >
              Ver detalhes do pedido
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
