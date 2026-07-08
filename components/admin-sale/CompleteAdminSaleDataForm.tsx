"use client";

import { useState } from "react";

type Props = { token: string };

export function CompleteAdminSaleDataForm({ token }: Props) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    destinationCep: "",
    addressStreet: "",
    addressNumber: "",
    addressComplement: "",
    addressNeighborhood: "",
    addressCity: "",
    addressState: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/admin-sale/${token}/customer-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao enviar.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <h2 className="text-lg font-semibold text-emerald-900">Dados enviados com sucesso!</h2>
        <p className="mt-2 text-sm text-emerald-700">Obrigada. Em breve entraremos em contato sobre sua compra.</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-stone-900">Complete seus dados</h2>
      <p className="text-sm text-stone-500">Preencha as informações para finalizar sua compra.</p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["name", "Nome completo"],
            ["email", "E-mail"],
            ["phone", "Telefone"],
            ["cpf", "CPF"],
            ["destinationCep", "CEP"],
            ["addressStreet", "Rua"],
            ["addressNumber", "Número"],
            ["addressComplement", "Complemento"],
            ["addressNeighborhood", "Bairro"],
            ["addressCity", "Cidade"],
            ["addressState", "Estado (UF)"],
          ] as const
        ).map(([key, label]) => (
          <input
            key={key}
            required={key !== "addressComplement" && key !== "cpf"}
            placeholder={label}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
        ))}
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-stone-900 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Enviando…" : "Enviar dados"}
      </button>
    </form>
  );
}
