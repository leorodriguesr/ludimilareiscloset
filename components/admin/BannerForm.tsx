"use client";

import { useEffect, useState } from "react";
import { ImageUpload } from "./ImageUpload";

interface BannerFormProps {
  currentUrl: string;
  currentMobileUrl: string;
  onSuccess: () => void;
}

export function BannerForm({
  currentUrl,
  currentMobileUrl,
  onSuccess,
}: BannerFormProps) {
  const [url, setUrl] = useState(currentUrl);
  const [mobileUrl, setMobileUrl] = useState(currentMobileUrl);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setUrl(currentUrl);
    setMobileUrl(currentMobileUrl);
  }, [currentUrl, currentMobileUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bannerImageUrl: url,
          bannerMobileImageUrl: mobileUrl,
        }),
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
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Banner desktop
          </label>
          <ImageUpload
            value={url}
            onChange={setUrl}
            folder="ludimila-reis-closet/banners"
            maxFilesPerBatch={1}
          />
          <p className="mt-1 text-xs text-stone-500">
            Recomendado em formato paisagem (ex.: 21:9). Deixe vazio para o
            placeholder padrão.
          </p>
        </div>

        {url && (
          <div className="relative aspect-[21/9] w-full overflow-hidden rounded-lg bg-stone-100">
            <img
              src={url}
              alt="Preview do banner desktop"
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-stone-100 pt-8">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Banner mobile
          </label>
          <ImageUpload
            value={mobileUrl}
            onChange={setMobileUrl}
            folder="ludimila-reis-closet/banners"
            maxFilesPerBatch={1}
          />
          <p className="mt-1 text-xs text-stone-500">
            Recomendado em formato mais vertical (ex.: 4:5 ou 9:16). Se vazio,
            o banner desktop será usado no celular.
          </p>
        </div>

        {mobileUrl && (
          <div className="relative mx-auto aspect-[4/5] w-full max-w-xs overflow-hidden rounded-lg bg-stone-100">
            <img
              src={mobileUrl}
              alt="Preview do banner mobile"
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {saved && (
          <span className="text-sm font-medium text-emerald-600">
            Banner atualizado!
          </span>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-sky-100 px-8 py-2.5 text-sm font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Salvar Banner"}
        </button>
      </div>
    </form>
  );
}
