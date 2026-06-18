"use client";

import Link from "next/link";
import { useEffect } from "react";

interface LoginPromptModalProps {
  onClose: () => void;
}

export function LoginPromptModal({ onClose }: LoginPromptModalProps) {
  // Fecha com Esc
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-stone-400 hover:text-stone-700"
          aria-label="Fechar"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-6 flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100">
            <svg className="h-7 w-7 text-stone-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </span>
        </div>

        <h2 className="mb-1 text-center text-lg font-medium text-stone-900">
          Salve seus favoritos
        </h2>
        <p className="mb-6 text-center text-sm text-stone-500">
          Entre na sua conta para guardar os produtos que você ama e acessá-los quando quiser.
        </p>

        <div className="space-y-3">
          <Link
            href="/login?next=/"
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            Entrar na conta
          </Link>
          <Link
            href="/cadastro?next=/"
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-full border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
          >
            Criar conta grátis
          </Link>
        </div>
      </div>
    </div>
  );
}
