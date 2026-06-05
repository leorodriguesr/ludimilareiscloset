import { notFound } from "next/navigation";
import Link from "next/link";
import { syncOrderPaymentFromReturn } from "@/app/pedido/actions";
import { prisma } from "@/lib/prisma";
import { describeCartPieceSelection } from "@/lib/cart/format-piece-selections";
import type { CartPieceSelection } from "@/lib/cart/types";
import { formatPrice } from "@/lib/format";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickReceiptUrl(
  sp: Record<string, string | string[] | undefined>
): string | undefined {
  const keys = ["receipt_url", "receiptUrl"];
  for (const k of keys) {
    const v = sp[k];
    if (typeof v === "string" && v.startsWith("http")) return v;
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].startsWith("http")) {
      return v[0];
    }
  }
  return undefined;
}

function statusLabel(status: string): string {
  if (status === "paid") return "pagamento concluído";
  return "aguardando pagamento";
}

export default async function PedidoPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  await syncOrderPaymentFromReturn(id, sp);

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { name: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!order) notFound();

  const receiptUrl = pickReceiptUrl(sp);

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
        Pedido registrado
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-stone-900">
        Obrigada pela sua compra
      </h1>
      <p className="mt-3 text-sm text-stone-600 leading-relaxed">
        Seu pedido <span className="font-mono text-stone-800">{order.id}</span>{" "}
        está com status{" "}
        <span className="font-medium text-stone-900">
          {statusLabel(order.status)}
        </span>
        .
        {order.status === "pending_payment" && (
          <>
            {" "}
            Se fechou a aba do pagamento, volte ao checkout ou entre em contato
            com o suporte informando o número do pedido.
          </>
        )}
      </p>

      {(receiptUrl || order.status === "paid") && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950 space-y-2">
          {order.status === "paid" && (
            <p className="font-medium">Pagamento confirmado.</p>
          )}
          {receiptUrl && (
            <p>
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2 hover:text-emerald-800"
              >
                Ver comprovante na InfinitePay
              </a>
            </p>
          )}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 space-y-1">
        <p>
          E-mail: <span className="font-medium">{order.email}</span>
        </p>
        {order.destinationCep && (
          <p>
            CEP de entrega:{" "}
            <span className="font-medium tabular-nums">{order.destinationCep}</span>
          </p>
        )}
        {order.shippingAmount > 0 && order.shippingServiceName && (
          <p>
            Frete ({order.shippingServiceName}):{" "}
            <span className="font-medium tabular-nums">
              {formatPrice(order.shippingAmount)}
            </span>
          </p>
        )}
        <p className="tabular-nums">
          Total:{" "}
          <span className="font-semibold text-stone-900">
            {formatPrice(order.total)}
          </span>
        </p>
      </div>

      <ul className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
        {order.items.map((it) => {
          let pieceSelections: CartPieceSelection[] | undefined;
          if (it.pieceSelectionsJson) {
            try {
              const parsed = JSON.parse(it.pieceSelectionsJson) as unknown;
              if (Array.isArray(parsed)) {
                pieceSelections = parsed.filter(
                  (row): row is CartPieceSelection =>
                    Boolean(row) &&
                    typeof row === "object" &&
                    "pieceName" in row
                ) as CartPieceSelection[];
              }
            } catch {
              pieceSelections = undefined;
            }
          }
          return (
            <li key={it.id} className="flex justify-between gap-4 py-3 text-sm">
              <span className="text-stone-700 min-w-0">
                <span className="font-medium text-stone-900">
                  {it.product.name}
                </span>
                <span className="text-stone-500"> × {it.quantity}</span>
                {pieceSelections && pieceSelections.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {pieceSelections.map((row, idx) => {
                      const detail = describeCartPieceSelection(row);
                      if (!detail) return null;
                      return (
                        <li
                          key={`${row.pieceName}-${idx}`}
                          className="text-xs text-stone-600"
                        >
                          {pieceSelections!.length > 1 ? (
                            <>
                              <span className="font-medium text-stone-700">
                                {row.pieceName}:{" "}
                              </span>
                              {detail}
                            </>
                          ) : (
                            detail
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </span>
              <span className="shrink-0 tabular-nums font-medium text-stone-900">
                {formatPrice(it.price * it.quantity)}
              </span>
            </li>
          );
        })}
      </ul>

      {order.shippingAmount > 0 && (
        <div className="flex justify-between gap-4 py-3 text-sm border-b border-stone-200 text-stone-700">
          <span>Frete</span>
          <span className="tabular-nums font-medium text-stone-900">
            {formatPrice(order.shippingAmount)}
          </span>
        </div>
      )}

      <div className="flex justify-between gap-4 py-3 text-sm font-semibold text-stone-900">
        <span>Total pago / a pagar</span>
        <span className="tabular-nums">{formatPrice(order.total)}</span>
      </div>

      <Link
        href="/"
        className="mt-10 inline-block rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
      >
        Voltar à loja
      </Link>
    </div>
  );
}
