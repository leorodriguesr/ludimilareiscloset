import { Suspense } from "react";
import Link from "next/link";
import { ClientLoginForm } from "@/components/auth/ClientLoginForm";

export default function AdminLoginPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <Suspense
        fallback={
          <div className="mx-auto h-64 max-w-md animate-pulse rounded-2xl bg-stone-100" />
        }
      >
        <ClientLoginForm
          intent="admin"
          heading="Painel administrativo"
          sub="Acesso restrito a administradores."
          showRegisterLink={false}
          defaultRedirect="/admin"
        />
      </Suspense>
      <p className="mx-auto mt-8 max-w-md text-center text-sm text-stone-500">
        <Link href="/" className="underline hover:text-stone-800">
          Voltar à loja
        </Link>
      </p>
    </div>
  );
}
