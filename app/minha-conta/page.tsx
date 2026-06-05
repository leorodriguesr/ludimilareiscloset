import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountOrders } from "@/components/account/AccountOrders";
import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/components/auth/LogoutButton";

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

  const orders = await prisma.order.findMany({
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

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Minha conta</h1>
          <p className="mt-1 text-sm text-stone-500">
            Olá, {user.name}. Acompanhe seus pedidos abaixo.
          </p>
        </div>
        <LogoutButton className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50" />
      </div>

      <dl className="mt-10 space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Nome
          </dt>
          <dd className="mt-1 text-stone-900">{user.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
            E-mail
          </dt>
          <dd className="mt-1 text-stone-900">{user.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Telefone
          </dt>
          <dd className="mt-1 text-stone-900">{user.phone}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Perfil
          </dt>
          <dd className="mt-1 text-stone-900">
            {isAdmin ? "Administrador" : "Cliente"}
          </dd>
        </div>
      </dl>

      <section className="mt-14">
        <h2 className="text-lg font-semibold text-stone-900">Meus pedidos</h2>
        <p className="mt-1 text-sm text-stone-500">
          Pedidos feitos enquanto você estava logada ficam listados aqui.
        </p>
        <AccountOrders orders={orders} />
      </section>

      {isAdmin ? (
        <p className="mt-10 text-sm text-stone-600">
          <Link href="/admin" className="font-medium text-stone-900 underline">
            Ir ao painel administrativo
          </Link>
        </p>
      ) : null}
    </div>
  );
}
