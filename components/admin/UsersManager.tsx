"use client";

import { useCallback, useEffect, useState } from "react";
import { onlyDigits, phoneFmt } from "@/lib/admin-sale/customer-form-input";

type StaffUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  createdAt: string;
};

type UserFormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  role: "GESTOR" | "ADMIN";
};

const MASTER_ADMIN_EMAIL = "adm.l.ribeiro@gmail.com";

const EMPTY_FORM: UserFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  role: "GESTOR",
};

const TOOLBAR_SIZE = "box-border h-9 text-sm font-medium leading-none sm:h-8";

const INPUT_CLS =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200";

function isMasterAdmin(email: string) {
  return email.trim().toLowerCase() === MASTER_ADMIN_EMAIL;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500">
      {children}
    </label>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  required,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={required ? 6 : undefined}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`${INPUT_CLS} pr-10`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-stone-400 transition-colors hover:text-stone-700"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
    </div>
  );
}

function UserFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: StaffUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editingMaster = mode === "edit" && initial ? isMasterAdmin(initial.email) : false;
  const [form, setForm] = useState<UserFormState>(() =>
    initial
      ? {
          name: initial.name,
          email: initial.email,
          phone: onlyDigits(initial.phone, 11),
          password: "",
          confirmPassword: "",
          role: initial.role === "ADMIN" ? "ADMIN" : "GESTOR",
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (onlyDigits(form.phone, 11).length < 10) {
      setError("Informe um telefone válido.");
      return;
    }

    if (mode === "create" || form.password || form.confirmPassword) {
      if (form.password.length < 6) {
        setError("A senha deve ter no mínimo 6 caracteres.");
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError("As senhas não coincidem.");
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: onlyDigits(form.phone, 11),
        role: form.role,
        ...(form.password ? { password: form.password } : {}),
      };

      const res = await fetch(
        mode === "create" ? "/api/admin/users" : `/api/admin/users/${initial!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "create" ? { ...payload, password: form.password } : payload
          ),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar.");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-stone-200 bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-stone-900">
              {mode === "create" ? "Cadastrar usuário" : "Editar usuário"}
            </h3>
            <p className="mt-0.5 text-sm text-stone-500">
              {mode === "create"
                ? "Crie uma conta de admin ou gestor."
                : "Atualize os dados do usuário."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
        >
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div>
            <FieldLabel>Nome</FieldLabel>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={INPUT_CLS}
            />
          </div>

          <div>
            <FieldLabel>E-mail</FieldLabel>
            <input
              required
              type="email"
              value={form.email}
              disabled={editingMaster}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={`${INPUT_CLS} disabled:bg-stone-50 disabled:text-stone-500`}
            />
          </div>

          <div>
            <FieldLabel>Telefone</FieldLabel>
            <input
              required
              inputMode="numeric"
              placeholder="(00) 00000-0000"
              value={phoneFmt(form.phone)}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: onlyDigits(e.target.value, 11) }))
              }
              className={INPUT_CLS}
            />
          </div>

          <div>
            <FieldLabel>Papel</FieldLabel>
            <select
              value={form.role}
              disabled={editingMaster}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  role: e.target.value as "GESTOR" | "ADMIN",
                }))
              }
              className={`${INPUT_CLS} disabled:bg-stone-50 disabled:text-stone-500`}
            >
              <option value="GESTOR">Gestor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          <PasswordField
            label={mode === "create" ? "Senha" : "Nova senha"}
            value={form.password}
            onChange={(value) => setForm((f) => ({ ...f, password: value }))}
            required={mode === "create"}
            placeholder={mode === "edit" ? "Deixe em branco para manter" : "Mínimo 6 caracteres"}
            autoComplete={mode === "create" ? "new-password" : "new-password"}
          />

          <PasswordField
            label="Confirmar senha"
            value={form.confirmPassword}
            onChange={(value) => setForm((f) => ({ ...f, confirmPassword: value }))}
            required={mode === "create" || form.password.length > 0}
            placeholder="Repita a senha"
            autoComplete="new-password"
          />

          <div className="flex gap-2 pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-50"
            >
              {saving
                ? "Salvando…"
                : mode === "create"
                  ? "Cadastrar"
                  : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UsersManager() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | StaffUser | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar.");
      setUsers(data.users ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function handleDelete(user: StaffUser) {
    if (isMasterAdmin(user.email)) return;
    if (!confirm(`Excluir o usuário ${user.name}?`)) return;

    setDeletingId(user.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao excluir.");
      await fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Usuários</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Gerencie contas de admin e gestor.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal("create")}
          className={`inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 ${TOOLBAR_SIZE}`}
        >
          Cadastrar usuário
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">E-mail</th>
                <th className="px-4 py-3 font-semibold">Telefone</th>
                <th className="px-4 py-3 font-semibold">Papel</th>
                <th className="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone-400">
                    Carregando…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone-400">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const master = isMasterAdmin(u.email);
                  return (
                    <tr key={u.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-stone-900">
                        {u.name}
                        {master ? (
                          <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                            Master
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-stone-600">{u.email}</td>
                      <td className="px-4 py-3 tabular-nums text-stone-600">
                        {phoneFmt(onlyDigits(u.phone, 11)) || "—"}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {u.role === "ADMIN" ? "Admin" : "Gestor"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setModal(u)}
                            className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                            aria-label={`Editar ${u.name}`}
                            title="Editar"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                          </button>
                          {!master ? (
                            <button
                              type="button"
                              onClick={() => void handleDelete(u)}
                              disabled={deletingId === u.id}
                              className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              aria-label={`Excluir ${u.name}`}
                              title="Excluir"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "create" ? (
        <UserFormModal
          mode="create"
          onClose={() => setModal(null)}
          onSaved={() => void fetchUsers()}
        />
      ) : null}

      {modal && modal !== "create" ? (
        <UserFormModal
          mode="edit"
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={() => void fetchUsers()}
        />
      ) : null}
    </div>
  );
}
