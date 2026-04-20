import { Suspense } from "react";
import { ClientLoginForm } from "@/components/auth/ClientLoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <Suspense
        fallback={
          <div className="mx-auto h-64 max-w-md animate-pulse rounded-2xl bg-stone-100" />
        }
      >
        <ClientLoginForm
          intent="client"
          heading="Entrar"
          sub="Acesse sua conta para ver pedidos e preferências."
          showRegisterLink
          defaultRedirect="/minha-conta"
        />
      </Suspense>
    </div>
  );
}
