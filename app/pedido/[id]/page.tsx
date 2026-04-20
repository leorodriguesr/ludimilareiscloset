import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PedidoPage({ params }: PageProps) {
  const { id } = await params;

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
          aguardando pagamento
        </span>
        . Em breve você poderá concluir o pagamento por aqui.
      </p>

      <div className="mt-8 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 space-y-1">
        <p>
          E-mail: <span className="font-medium">{order.email}</span>
        </p>
        <p className="tabular-nums">
          Total:{" "}
          <span className="font-semibold text-stone-900">
            {formatPrice(order.total)}
          </span>
        </p>
      </div>

      <ul className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
        {order.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-4 py-3 text-sm">
            <span className="text-stone-700 min-w-0">
              <span className="font-medium text-stone-900">
                {it.product.name}
              </span>
              <span className="text-stone-500"> × {it.quantity}</span>
            </span>
            <span className="shrink-0 tabular-nums font-medium text-stone-900">
              {formatPrice(it.price * it.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href="/"
        className="mt-10 inline-block rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
      >
        Voltar à loja
      </Link>
    </div>
  );
}
