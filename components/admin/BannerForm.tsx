"use client";

import { useState } from "react";
import { ImageUpload } from "./ImageUpload";

interface BannerFormProps {
  currentUrl: string;
  onSuccess: () => void;
}

export function BannerForm({ currentUrl, onSuccess }: BannerFormProps) {
  const [url, setUrl] = useState(currentUrl);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerImageUrl: url }),
      });

      if (res.ok) {
        setSaved(true);
        onSuccess();
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Imagem do banner
        </label>
        <ImageUpload
          value={url}
          onChange={setUrl}
          folder="ludimila-reis-closet/banners"
          maxFilesPerBatch={1}
        />
        <p className="mt-1 text-xs text-stone-500">
          Deixe vazio para usar o banner padrão com gradiente.
        </p>
      </div>

      {url && (
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-lg bg-stone-100">
          <img
            src={url}
            alt="Preview do banner"
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-stone-900 px-8 py-2.5 text-sm font-medium text-white hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 disabled:opacity-50 transition-colors"
        >
          {loading ? "Salvando..." : "Salvar Banner"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium">
            Banner atualizado!
          </span>
        )}
      </div>
    </form>
  );
}
