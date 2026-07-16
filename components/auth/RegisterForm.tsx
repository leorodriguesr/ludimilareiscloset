"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import {
  onlyDigits,
  phoneFmt,
} from "@/lib/admin-sale/customer-form-input";

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const phoneDigits = onlyDigits(phone, 11);
    if (phoneDigits.length < 10) {
      setError("Informe um telefone válido com DDD.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone: phoneDigits,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Não foi possível cadastrar.");
        return;
      }
      router.push("/minha-conta");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-stone-900">Criar conta</h1>
      <p className="mt-2 text-sm text-stone-500">
        Preencha seus dados para acompanhar pedidos e trocas no futuro.
      </p>
      {oauthError ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {oauthError}
        </p>
      ) : null}
      <div className="mt-6">
        <GoogleSignInButton nextPath="/minha-conta" />
      </div>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-stone-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wide">
          <span className="bg-white px-2 text-stone-500">ou cadastre-se com e-mail</span>
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-stone-700">
            Nome completo
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          />
        </div>
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
          <label htmlFor="phone" className="block text-sm font-medium text-stone-700">
            Telefone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required
            placeholder="(00) 00000-0000"
            value={phoneFmt(phone)}
            onChange={(e) => setPhone(onlyDigits(e.target.value, 11))}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-stone-700">
            Senha (mín. 6 caracteres)
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
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
          {loading ? "Criando…" : "Cadastrar"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-600">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-stone-900 underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
