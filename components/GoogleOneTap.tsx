"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          prompt: (callback?: (notification: unknown) => void) => void;
          cancel: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

interface Props {
  clientId: string;
}

export function GoogleOneTap({ clientId }: Props) {
  const router = useRouter();

  useEffect(() => {
    const GSI_SRC = "https://accounts.google.com/gsi/client";
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);

    const script = existing ?? document.createElement("script");

    const init = () => {
      if (!window.google) return;

      const justLoggedOut = sessionStorage.getItem("one_tap_suppress") === "1";
      if (justLoggedOut) {
        sessionStorage.removeItem("one_tap_suppress");
        window.google.accounts.id.disableAutoSelect();
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential: string }) => {
          try {
            const res = await fetch("/api/auth/google/one-tap", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential: response.credential }),
            });
            if (res.ok) {
              window.dispatchEvent(new Event("auth:login"));
              router.refresh();
            } else {
              const body = await res.json().catch(() => ({}));
              console.warn("[OneTap] login recusado:", res.status, body?.error ?? "");
            }
          } catch (e) {
            console.error("[OneTap] erro de rede:", e);
          }
        },
        auto_select: !justLoggedOut,
        cancel_on_tap_outside: false,
        context: "signin",
        use_fedcm_for_prompt: true,
      });

      window.google.accounts.id.prompt();
    };

    if (existing) {
      // Script já carregado — inicializa diretamente.
      if (window.google) init();
    } else {
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = init;
      script.onerror = () => console.error("[OneTap] falha ao carregar o script GSI.");
      document.head.appendChild(script);
    }

    return () => {
      window.google?.accounts.id.cancel();
    };
  }, [clientId, router]);

  return null;
}
