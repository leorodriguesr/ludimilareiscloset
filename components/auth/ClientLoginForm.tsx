"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

type Props = {
  intent: "client" | "admin";
  heading: string;
  sub?: string;
  showRegisterLink?: boolean;
  defaultRedirect: string;
};

export function ClientLoginForm({
  intent,
  heading,
  sub,
  showRegisterLink = true,
  defaultRedirect,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const oauthError = searchParams.get("error");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const googleNext =
    intent === "client" ? (safeNext ?? defaultRedirect) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, intent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Falha no login.");
        return;
      }
      router.push(safeNext ?? defaultRedirect);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-stone-900">{heading}</h1>
      {sub ? <p className="mt-2 text-sm text-stone-500">{sub}</p> : null}
      {oauthError ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {oauthError}
        </p>
      ) : null}
      {intent === "client" ? (
        <>
          <div className="mt-6">
            <GoogleSignInButton nextPath={googleNext} />
          </div>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-stone-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wide">
              <span className="bg-white px-2 text-stone-500">ou com e-mail</span>
            </div>
          </div>
        </>
      ) : null}
      <form onSubmit={onSubmit} className={`space-y-4 ${intent === "client" ? "" : "mt-6"}`}>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-stone-700">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-stone-700">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          />
        </div>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
      {showRegisterLink && intent === "client" ? (
        <p className="mt-6 text-center text-sm text-stone-600">
          Não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-stone-900 underline">
            Cadastre-se
          </Link>
        </p>
      ) : null}
    </div>
  );
}
