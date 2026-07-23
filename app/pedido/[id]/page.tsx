import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { syncOrderPaymentFromReturn } from "@/app/pedido/actions";
import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { describeCartPieceSelection } from "@/lib/cart/format-piece-selections";
import type { CartPieceSelection } from "@/lib/cart/types";
import {
  resolveShippingFeeDisplay,
  shippingFeeDisplayText,
} from "@/lib/admin-sale/arranged-delivery";
import { formatPrice } from "@/lib/format";
import { ClearCartOnPaymentSuccess } from "@/components/cart/ClearCartOnPaymentSuccess";
import { PAYMENT_GATEWAY } from "@/lib/orders/constants";
import { getActivePaymentAttempt } from "@/lib/orders/get-active-payment-attempt";
import {
  orderItemDisplayImageUrl,
  orderItemDisplayName,
} from "@/lib/orders/order-item-display";

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
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].startsWith("http"))
      return v[0];
  }
  return undefined;
}

function cpfMask(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11) return v;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function cepMask(v: string) {
  const d = v.replace(/\D/g, "");
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function phoneMask(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default async function PedidoPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  await syncOrderPaymentFromReturn(id, sp);

  const [order, session] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                images: { orderBy: { order: "asc" }, take: 1, select: { url: true } },
              },
            },
          },
          orderBy: { id: "asc" },
        },
      },
    }),
    getAppSession(),
  ]);

  if (!order) notFound();

  const receiptUrl = pickReceiptUrl(sp);
  const isPaid = order.status === "paid";
  const activeAttempt = !isPaid ? await getActivePaymentAttempt(id) : null;
  const isPix = order.paymentMethod === "pix";
  const isCard = order.paymentMethod === "card";
  const isInfinitePay =
    isCard &&
    (!!order.infinitePayInvoiceSlug ||
      activeAttempt?.gateway === PAYMENT_GATEWAY.INFINITEPAY);
  const loggedIn = Boolean(session.user);

  const subtotal = order.items.reduce((a, it) => a + it.price * it.quantity, 0);
  const shippingFee = resolveShippingFeeDisplay({
    shippingServiceName: order.shippingServiceName,
    deliveryNotes: order.deliveryNotes,
    shippingAmount: order.shippingAmount,
  });
  const shippingFeeLabel = shippingFeeDisplayText(shippingFee, formatPrice);

  return (
    <div className="min-h-screen bg-stone-50">
      {isPaid ? <ClearCartOnPaymentSuccess /> : null}
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">

        {/* ── Hero ── */}
        <div className="mb-8 text-center">
          {isPaid ? (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-8 w-8 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
            Pedido registrado
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            {isPaid ? "Obrigada pela sua compra! 🎉" : "Seu pedido foi recebido"}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            {order.orderNumber ? (
              <span className="font-medium text-stone-700">Pedido #{order.orderNumber}</span>
            ) : null}
          </p>
        </div>

        {/* ── Receipt (InfinitePay) ── */}
        {(receiptUrl || (isPaid && isInfinitePay)) && (
          <div className="mb-6 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-emerald-200">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600">
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-900">Pagamento confirmado</p>
                <p className="text-[11px] text-emerald-700">Recebemos a confirmação do seu pagamento</p>
              </div>
            </div>
            {receiptUrl && (
              <div className="px-4 py-3">
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
                >
                  Ver comprovante na InfinitePay
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
          </div>
        )}

        {/* ── Pix pending ── */}
        {isPix && !isPaid && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <Image src="/pix-icon.svg" alt="Pix" width={20} height={20} unoptimized className="mt-0.5 h-5 w-5 shrink-0 object-contain" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Aguardando confirmação do Pix</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  Assim que o pagamento for confirmado pelo banco, seu pedido entrará em processamento automaticamente. Isso costuma levar menos de 1 minuto.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Card pending ── */}
        {isCard && !isPaid && !isInfinitePay && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">Aguardando confirmação do pagamento</p>
            <p className="mt-1 text-xs text-amber-800">
              Se você fechou a aba do pagamento antes de concluir, entre em contato informando o número do pedido.
            </p>
          </div>
        )}

        {/* ── Tracking timeline ── */}
        <div className="mb-6 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-4">
            <svg className="h-4 w-4 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
            <h2 className="text-sm font-semibold text-stone-900">Acompanhe seu pedido</h2>
          </div>
          <div className="px-5 py-4">
            <ol className="relative space-y-0">
              {[
                {
                  key: "order",
                  icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z",
                  label: "Pedido confirmado",
                  sub: "Recebemos o seu pedido com sucesso.",
                  done: true,
                  active: false,
                },
                {
                  key: "payment",
                  icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
                  label: isPaid ? "Pagamento confirmado" : "Aguardando pagamento",
                  sub: isPaid ? "Seu pagamento foi aprovado." : "Assim que confirmado, o pedido entra em preparação.",
                  done: isPaid,
                  active: !isPaid,
                },
                {
                  key: "pack",
                  icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10",
                  label: "Separação e embalagem",
                  sub: "Seu pedido está sendo preparado com cuidado.",
                  done: false,
                  active: isPaid,
                },
                {
                  key: "shipped",
                  icon: "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
                  label: "Enviado",
                  sub: "Você receberá o código de rastreio por e-mail.",
                  done: false,
                  active: false,
                },
                {
                  key: "done",
                  icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
                  label: "Entregue",
                  sub: "Esperamos que você adore!",
                  done: false,
                  active: false,
                },
              ].map((s, i, arr) => (
                <li key={s.key} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      s.done    ? "border-stone-900 bg-stone-900"
                      : s.active ? "border-stone-900 bg-white"
                      : "border-stone-200 bg-white"
                    }`}>
                      {s.done ? (
                        <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className={`h-4 w-4 ${s.active ? "text-stone-900" : "text-stone-300"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                        </svg>
                      )}
                    </div>
                    {i < arr.length - 1 && (
                      <div className={`mt-1 w-0.5 flex-1 min-h-[1.5rem] transition-colors ${s.done ? "bg-stone-900" : "bg-stone-200"}`} />
                    )}
                  </div>
                  <div className={`pb-5 pt-1 ${i === arr.length - 1 ? "pb-0" : ""}`}>
                    <p className={`text-sm font-medium ${s.active ? "text-stone-900" : s.done ? "text-stone-700" : "text-stone-300"}`}>
                      {s.label}
                    </p>
                    {(s.done || s.active) && (
                      <p className="mt-0.5 text-xs text-stone-500">{s.sub}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="border-t border-stone-100 bg-stone-50 px-5 py-3">
            <p className="text-xs text-stone-500">
              Acompanhe o status do seu pedido em tempo real na{" "}
              <Link href="/minha-conta" className="font-medium text-stone-900 underline-offset-2 hover:underline">
                sua conta
              </Link>
              . Você também receberá atualizações por e-mail.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* ── Customer data ── */}
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
              <svg className="h-4 w-4 text-stone-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Cliente</h2>
            </div>
            <div className="space-y-2 px-4 py-3 text-sm">
              {order.recipientName && (
                <p className="font-semibold text-stone-900">{order.recipientName}</p>
              )}
              <p className="text-stone-600">{order.email}</p>
              {order.phone && (
                <p className="text-stone-500">{phoneMask(order.phone)}</p>
              )}
              {order.cpf && (
                <p className="text-stone-500">CPF: {cpfMask(order.cpf)}</p>
              )}
            </div>
          </div>

          {/* ── Delivery address ── */}
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
              <svg className="h-4 w-4 text-stone-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Entrega</h2>
            </div>
            <div className="space-y-1 px-4 py-3 text-sm text-stone-600">
              {order.addressStreet && (
                <p className="text-stone-900">
                  {order.addressStreet}{order.addressNumber ? `, ${order.addressNumber}` : ""}
                  {order.addressComplement ? ` — ${order.addressComplement}` : ""}
                </p>
              )}
              {order.addressNeighborhood && <p>{order.addressNeighborhood}</p>}
              {(order.addressCity || order.addressState) && (
                <p>
                  {[order.addressCity, order.addressState].filter(Boolean).join(" — ")}
                  {order.destinationCep ? ` · CEP ${cepMask(order.destinationCep)}` : ""}
                </p>
              )}
              {!order.addressStreet && order.destinationCep && (
                <p className="text-stone-500">CEP {cepMask(order.destinationCep)}</p>
              )}
              {order.shippingServiceName && (
                <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2">
                  <p className="text-xs text-stone-500">{order.shippingServiceName}</p>
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      shippingFee.kind === "free"
                        ? "text-emerald-600"
                        : "text-stone-900"
                    }`}
                  >
                    {shippingFeeLabel}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Items ── */}
        <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
            <svg className="h-4 w-4 text-stone-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              Itens do pedido
            </h2>
          </div>
          <ul className="divide-y divide-stone-100">
            {order.items.map((it) => {
              let pieceSelections: CartPieceSelection[] | undefined;
              if (it.pieceSelectionsJson) {
                try {
                  const parsed = JSON.parse(it.pieceSelectionsJson) as unknown;
                  if (Array.isArray(parsed)) {
                    pieceSelections = parsed.filter(
                      (row): row is CartPieceSelection =>
                        Boolean(row) && typeof row === "object" && "pieceName" in row
                    ) as CartPieceSelection[];
                  }
                } catch { /* noop */ }
              }

              const coverImage = orderItemDisplayImageUrl(it);
              const itemName = orderItemDisplayName(it);

              return (
                <li key={it.id} className="flex gap-4 px-4 py-4">
                  <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                    {coverImage ? (
                      <Image
                        src={coverImage}
                        alt={itemName}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-stone-300">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-stone-900">{itemName}</p>
                    {pieceSelections && pieceSelections.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {pieceSelections.map((row, idx) => {
                          const detail = describeCartPieceSelection(row);
                          if (!detail) return null;
                          return (
                            <li key={idx} className="text-xs text-stone-500">
                              {pieceSelections!.length > 1 ? (
                                <><span className="font-medium text-stone-600">{row.pieceName}: </span>{detail}</>
                              ) : detail}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <p className="mt-1 text-xs text-stone-400 tabular-nums">
                      {it.quantity} × {formatPrice(it.price)}
                    </p>
                  </div>
                  <p className="shrink-0 self-start text-sm font-semibold tabular-nums text-stone-900">
                    {formatPrice(it.price * it.quantity)}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-stone-100 bg-stone-50 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatPrice(subtotal)}</span>
            </div>
            {(shippingFee.kind === "priced" || shippingFee.kind === "to_arrange") && (
              <div className="flex justify-between text-stone-500">
                <span>Frete{order.shippingServiceName ? ` · ${order.shippingServiceName}` : ""}</span>
                <span className="tabular-nums">{shippingFeeLabel}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-stone-200 pt-1.5 font-semibold text-stone-900">
              <span className="flex items-center gap-1.5">
                {isPix && (
                  <Image src="/pix-icon.svg" alt="Pix" width={14} height={14} unoptimized className="h-3.5 w-3.5 object-contain" />
                )}
                {isCard && (
                  <svg className="h-3.5 w-3.5 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                )}
                Total
              </span>
              <span className="tabular-nums">{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/minha-conta"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            {loggedIn ? "Acompanhar na minha conta" : "Criar conta para acompanhar"}
          </Link>
          <Link
            href="/"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-6 py-3.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50"
          >
            Continuar comprando
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-stone-400">
          Dúvidas? Entre em contato pelo WhatsApp ou nas nossas redes sociais.
        </p>

      </div>
    </div>
  );
}
