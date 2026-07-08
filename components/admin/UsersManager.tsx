"use client";

import { useCallback, useEffect, useState } from "react";

type StaffUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  createdAt: string;
};

export function UsersManager() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "GESTOR" as "GESTOR" | "ADMIN",
  });
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar.");
      setUsers(data.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar.");
      setForm({ name: "", email: "", phone: "", password: "", role: "GESTOR" });
      await fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">Usuários</h2>
        <p className="text-sm text-stone-500">Gerencie contas de admin e gestor.</p>
      </div>

      <form onSubmit={(e) => void handleCreate(e)} className="rounded-xl border border-stone-200 bg-white p-6 space-y-4 max-w-lg">
        <h3 className="font-medium text-stone-900">Novo usuário</h3>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" required />
        <input placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" required />
        <input placeholder="Telefone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" required />
        <input placeholder="Senha (mín. 6)" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" required minLength={6} />
        <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "GESTOR" | "ADMIN" }))} className="w-full rounded-lg border px-3 py-2 text-sm">
          <option value="GESTOR">Gestor</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button type="submit" disabled={saving} className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {saving ? "Criando…" : "Criar usuário"}
        </button>
      </form>

      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-stone-50 text-left text-xs uppercase text-stone-400">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Papel</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-6 text-stone-400">Carregando…</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-b border-stone-100">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.role === "ADMIN" ? "Admin" : "Gestor"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
