import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function CadastroPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <Suspense
        fallback={
          <div className="mx-auto h-96 max-w-md animate-pulse rounded-2xl bg-stone-100" />
        }
      >
        <RegisterForm />
      </Suspense>
    </div>
  );
}
