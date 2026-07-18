"use client";

import { useState } from "react";

type Props = {
  className?: string;
  children?: React.ReactNode;
};

export function LogoutButton({ className, children }: Props) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.dispatchEvent(new Event("auth:logout"));
      // Sinaliza para o GoogleOneTap que o usuário saiu intencionalmente.
      // O script GSI não está carregado em páginas autenticadas, então
      // disableAutoSelect() não pode ser chamado diretamente aqui.
      sessionStorage.setItem("one_tap_suppress", "1");
      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className={className}
    >
      {loading ? "Saindo…" : children ?? "Sair"}
    </button>
  );
}
