"use client";

import { useEffect, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";

type ReverseDraft = {
  trackingCode: string;
  postingLocationAddress: string;
  postingLocationMapsUrl: string;
  labelUrl: string;
};

function emptyDraft(): ReverseDraft {
  return {
    trackingCode: "",
    postingLocationAddress: "",
    postingLocationMapsUrl: "",
    labelUrl: "",
  };
}

function hasSavedReverse(draft: ReverseDraft): boolean {
  return Boolean(
    draft.trackingCode.trim() ||
      draft.postingLocationAddress.trim() ||
      draft.labelUrl.trim()
  );
}

/** Evita o card/preview do WhatsApp sem impedir o clique no link. */
function whatsAppSafeUrl(url: string): string {
  return url.replace(/^(https?:\/\/)/i, "$1\u200B");
}

function indentValue(value: string): string {
  return `\u00A0\u00A0\u00A0${value}`;
}

function reverseWhatsAppMessage(draft: ReverseDraft): string {
  const address = draft.postingLocationAddress.trim();
  const maps = draft.postingLocationMapsUrl.trim();
  const label = draft.labelUrl.trim();

  const lines = [
    "Oi! Sua etiqueta reversa já está pronta 🤍",
    "",
    "Imprima a etiqueta, embale bem a peça e cole por fora do pacote — sem cobrir o código de barras.",
  ];

  if (label) {
    lines.push(
      "",
      "🖨️ Imprimir etiqueta",
      "",
      indentValue(whatsAppSafeUrl(label))
    );
  }

  if (address || maps) {
    lines.push("", "📍 Onde postar", "");
    if (address) lines.push(indentValue(address));
    if (maps) lines.push(indentValue(whatsAppSafeUrl(maps)));
  }

  lines.push("", "Qualquer dúvida, é só responder aqui.");
  return lines.join("\n");
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function WhatsAppPreview({ draft }: { draft: ReverseDraft }) {
  const [copied, setCopied] = useState(false);
  const address = draft.postingLocationAddress.trim();
  const maps = draft.postingLocationMapsUrl.trim();
  const label = draft.labelUrl.trim();

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-[#efeae2] px-3 py-4">
        <div className="ml-auto max-w-[22rem] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2.5 text-[13px] leading-relaxed text-stone-900 shadow-sm">
          <p>Oi! Sua etiqueta reversa já está pronta 🤍</p>
          <p className="mt-2">
            Imprima a etiqueta, embale bem a peça e cole por fora do pacote.
          </p>
          {label ? (
            <div className="mt-3">
              <p className="font-medium">🖨️ Imprimir etiqueta</p>
              <p className="mt-1.5 pl-3 break-all text-[#027eb5] underline">
                {label}
              </p>
            </div>
          ) : null}
          {address || maps ? (
            <div className="mt-3">
              <p className="font-medium">📍 Onde postar</p>
              {address ? (
                <p className="mt-1.5 pl-3 whitespace-pre-wrap">{address}</p>
              ) : null}
              {maps ? (
                <p className="mt-1 pl-3 break-all text-[#027eb5] underline">
                  {maps}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="mt-3">Qualquer dúvida, é só responder aqui.</p>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            void copyText(reverseWhatsAppMessage(draft)).then((ok) => {
              if (!ok) return;
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="rounded-lg bg-sky-100 px-3 py-2 text-sm font-medium text-sky-900 ring-1 ring-sky-200/80 hover:bg-sky-200"
        >
          {copied ? "Copiado" : "Copiar mensagem"}
        </button>
      </div>
    </div>
  );
}

export function ExchangeReverseModal({
  exchangeId,
  busy,
  error,
  onClose,
  onSaved,
}: {
  exchangeId: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSaved: (body: ReverseDraft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ReverseDraft>(emptyDraft);
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/exchanges/${exchangeId}/return-shipping`
        );
        const data = (await res.json()) as {
          shipping?: {
            trackingCode?: string | null;
            postingLocationAddress?: string | null;
            postingLocationMapsUrl?: string | null;
            labelUrl?: string | null;
          } | null;
        };
        if (cancelled) return;
        const next: ReverseDraft = {
          trackingCode: data.shipping?.trackingCode ?? "",
          postingLocationAddress: data.shipping?.postingLocationAddress ?? "",
          postingLocationMapsUrl: data.shipping?.postingLocationMapsUrl ?? "",
          labelUrl: data.shipping?.labelUrl ?? "",
        };
        setDraft(next);
        setEditing(!hasSavedReverse(next));
      } catch {
        if (!cancelled) {
          setDraft(emptyDraft());
          setEditing(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exchangeId]);

  const title = editing
    ? hasSavedReverse(draft)
      ? "Editar reverso"
      : "Criar reverso"
    : "Etiqueta reversa";

  return (
    <AdminModal
      title={title}
      subtitle={
        editing
          ? "Dados para a cliente postar a peça."
          : "Copie a mensagem e cole no WhatsApp da cliente."
      }
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-40"
          >
            Fechar
          </button>
          {!loading && !editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Editar
            </button>
          ) : null}
          {!loading && editing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void onSaved(draft).then((ok) => {
                  if (ok) setEditing(false);
                });
              }}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Salvando…" : "Salvar reverso"}
            </button>
          ) : null}
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-stone-500">Carregando…</p>
      ) : editing ? (
        <div className="space-y-3">
          <label className="block text-xs font-medium text-stone-600">
            Código de rastreio
            <input
              value={draft.trackingCode}
              onChange={(e) =>
                setDraft((d) => ({ ...d, trackingCode: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              placeholder="Ex.: AA123456789BR"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Endereço do ponto de postagem{" "}
            <span className="font-normal text-stone-400">(opcional)</span>
            <textarea
              value={draft.postingLocationAddress}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  postingLocationAddress: e.target.value,
                }))
              }
              rows={3}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              placeholder="Agência, rua, número, bairro, cidade"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Link do Google Maps{" "}
            <span className="font-normal text-stone-400">(opcional)</span>
            <input
              value={draft.postingLocationMapsUrl}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  postingLocationMapsUrl: e.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              placeholder="https://maps.google.com/…"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Link da etiqueta (PDF no Drive)
            <input
              value={draft.labelUrl}
              onChange={(e) =>
                setDraft((d) => ({ ...d, labelUrl: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              placeholder="https://drive.google.com/…"
            />
          </label>
        </div>
      ) : (
        <WhatsAppPreview draft={draft} />
      )}
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </AdminModal>
  );
}
