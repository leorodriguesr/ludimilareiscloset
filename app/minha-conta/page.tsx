import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountOrders } from "@/components/account/AccountOrders";
import { getAppSession } from "@/lib/auth-session";
import { expirePendingOrdersForCustomer } from "@/lib/orders/expire-orders";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { formatPrice } from "@/lib/format";

export default async function MinhaContaPage() {
  const session = await getAppSession();
  if (!session.user) {
    redirect("/login?next=/minha-conta");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.userId },
  });

  if (!user) {
    redirect(`/api/auth/logout?next=${encodeURIComponent("/login?next=/minha-conta")}`);
  }

  const isStaff = user.role === "ADMIN" || user.role === "GESTOR";

  if (!isStaff) {
    await expirePendingOrdersForCustomer({
      userId: user.id,
      email: user.email,
    });
  }

  const orders = isStaff
    ? []
    : await prisma.order.findMany({
        where: {
          OR: [
            { userId: user.id },
            { email: user.email, userId: null },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            orderBy: { id: "asc" },
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  images: {
                    orderBy: { order: "asc" },
                    take: 1,
                    select: { url: true },
                  },
                },
              },
            },
          },
        },
      });

  const paidOrders = orders.filter((o) => o.status === "paid");
  const totalSpent = paidOrders.reduce((acc, o) => acc + o.total, 0);

  const initials = (user.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">

        {/* ── Header ── */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.picture}
                alt={user.name}
                className="h-14 w-14 rounded-full object-cover ring-2 ring-white shadow-sm"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-lg font-semibold text-white shadow-sm">
                {initials}
              </div>
            )}
            <div>
              <h1 className="text-xl font-semibold text-stone-900">
                Olá, {user.name.split(" ")[0]}
              </h1>
              <p className="mt-0.5 text-sm text-stone-500">{user.email}</p>
            </div>
          </div>
          <LogoutButton className="shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 shadow-sm hover:bg-stone-50" />
        </div>

        {/* ── Stats ── */}
        {/* <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Pedidos</p>
            <p className="mt-1 text-2xl font-bold text-stone-900">{orders.length}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Confirmados</p>
            <p className="mt-1 text-2xl font-bold text-stone-900">{paidOrders.length}</p>
          </div>
          <div className="col-span-2 rounded-xl border border-stone-200 bg-white px-4 py-3.5 shadow-sm sm:col-span-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Total gasto</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-stone-900">{formatPrice(totalSpent)}</p>
          </div>
        </div> */}

        {/* ── Profile card ── */}
        <div className="mb-8 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
            <svg className="h-4 w-4 text-stone-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Meus dados</h2>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-stone-400">Nome</dt>
              <dd className="mt-0.5 font-medium text-stone-900">{user.name}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-stone-400">E-mail</dt>
              <dd className="mt-0.5 text-stone-700 truncate">{user.email}</dd>
            </div>
            {user.phone && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wide text-stone-400">Telefone</dt>
                <dd className="mt-0.5 text-stone-700">{user.phone}</dd>
              </div>
            )}
            {user.cpf && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wide text-stone-400">CPF</dt>
                <dd className="mt-0.5 text-stone-700">{user.cpf}</dd>
              </div>
            )}
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-stone-400">Perfil</dt>
              <dd className="mt-0.5 text-stone-700">
                {user.role === "ADMIN" ? "Administrador" : user.role === "GESTOR" ? "Gestor" : "Cliente"}
              </dd>
            </div>
          </dl>
        </div>

        {isStaff ? (
          <Link
            href="/admin"
            className="flex items-center justify-between gap-4 rounded-xl border border-stone-900 bg-stone-900 px-5 py-3 text-white shadow-sm transition-colors hover:bg-stone-800"
          >
            <div>
              <p className="text-sm font-semibold">Painel administrativo</p>
              <p className="mt-0.5 text-xs text-stone-300">
                Gerencie vendas, envios e produtos
              </p>
            </div>
          </Link>
        ) : (
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900">Meus Pedidos</h2>
              {orders.length > 0 && (
                <p className="text-xs text-stone-400">
                  {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
                </p>
              )}
            </div>
            <AccountOrders
              orders={orders.map((o) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                createdAt: o.createdAt,
                status: o.status,
                expiresAt: o.expiresAt,
                expiredAt: o.expiredAt,
                paymentMethod: o.paymentMethod,
                total: o.total,
                shippingAmount: o.shippingAmount,
                shippingServiceName: o.shippingServiceName,
                shippingServiceId: o.shippingServiceId,
                shippingStatus: o.shippingStatus,
                shippingProvider: o.shippingProvider,
                shippingDeliveryDaysMin: o.shippingDeliveryDaysMin,
                shippingDeliveryDaysMax: o.shippingDeliveryDaysMax,
                superfreteShipmentId: o.superfreteShipmentId,
                trackingCode: o.trackingCode,
                superfreteStatus: o.superfreteStatus,
                recipientName: o.recipientName,
                addressStreet: o.addressStreet,
                addressNumber: o.addressNumber,
                addressComplement: o.addressComplement,
                addressNeighborhood: o.addressNeighborhood,
                addressCity: o.addressCity,
                addressState: o.addressState,
                destinationCep: o.destinationCep,
                items: o.items.map((it) => ({
                  id: it.id,
                  quantity: it.quantity,
                  price: it.price,
                  pieceSelectionsJson: it.pieceSelectionsJson,
                  productId: it.productId,
                  productName: it.productName,
                  productImageUrl: it.productImageUrl,
                  product: it.product
                    ? {
                        id: it.product.id,
                        name: it.product.name,
                        images: it.product.images,
                      }
                    : null,
                })),
              }))}
            />
          </section>
        )}

      </div>
    </div>
  );
}
