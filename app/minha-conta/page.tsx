import Link from "next/link";
import { redirect } from "next/navigation";
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
    session.destroy();
    await session.save();
    redirect("/login?next=/minha-conta");
  }

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Minha conta</h1>
          <p className="mt-1 text-sm text-stone-500">
            Olá, {user.name}. Em breve: pedidos, entregas e trocas.
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

      {isAdmin ? (
        <p className="mt-8 text-sm text-stone-600">
          <Link href="/admin" className="font-medium text-stone-900 underline">
            Ir ao painel administrativo
          </Link>
        </p>
      ) : null}
    </div>
  );
}
