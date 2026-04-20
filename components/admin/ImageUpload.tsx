"use client";

import { useEffect, useCallback, useState } from "react";
import {
  CldUploadWidget,
  type CloudinaryUploadWidgetResults,
} from "next-cloudinary";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  /** Quantos arquivos o usuário pode escolher por vez no seletor (banner: 1, produtos: várias). */
  maxFilesPerBatch?: number;
}

function unlockBodyScroll() {
  document.body.style.overflow = "";
  document.body.style.removeProperty("padding-right");
  document.documentElement.style.overflow = "";
  document.documentElement.style.removeProperty("padding-right");
}

function extractSecureUrls(results: CloudinaryUploadWidgetResults): string[] {
  const info = results.info;
  if (info == null) return [];

  if (Array.isArray(info)) {
    return info
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => item.secure_url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
  }

  if (typeof info === "object" && "secure_url" in info) {
    const u = (info as { secure_url?: unknown }).secure_url;
    if (typeof u === "string" && u.length > 0) return [u];
  }

  return [];
}

export function ImageUpload({
  value,
  onChange,
  folder = "ludimila-reis-closet",
  maxFilesPerBatch = 15,
}: ImageUploadProps) {
  /** Só incrementa quando o widget fecha — não ligar ao número de imagens, senão o 2º+ upload da mesma leva é cancelado. */
  const [widgetSession, setWidgetSession] = useState(0);

  const handleWidgetClosed = useCallback(() => {
    unlockBodyScroll();
    setWidgetSession((s) => s + 1);
  }, []);

  useEffect(() => {
    return () => {
      unlockBodyScroll();
    };
  }, []);

  function handleSuccess(results: CloudinaryUploadWidgetResults) {
    for (const url of extractSecureUrls(results)) {
      onChange(url);
    }
  }

  return (
    <div className="space-y-3">
      <CldUploadWidget
        key={widgetSession}
        uploadPreset={process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET}
        options={{
          maxFiles: maxFilesPerBatch,
          folder,
          resourceType: "image",
          clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
          maxFileSize: 5_000_000,
        }}
        onSuccess={handleSuccess}
        onClose={handleWidgetClosed}
      >
        {({ open }) => (
          <button
            type="button"
            onClick={() => open()}
            className="w-full rounded-lg border-2 border-dashed border-stone-300 px-4 py-6 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
          >
            {value
              ? "Trocar imagem"
              : maxFilesPerBatch > 1
                ? "Clique para enviar imagens (pode selecionar várias de uma vez)"
                : "Clique para enviar uma imagem"}
          </button>
        )}
      </CldUploadWidget>

      {value && (
        <div className="relative">
          <div className="aspect-square w-32 overflow-hidden rounded-lg bg-stone-100">
            <img
              src={value}
              alt="Preview"
              className="h-full w-full object-cover"
            />
          </div>
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 left-[7rem] flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600 transition-colors"
          >
            X
          </button>
        </div>
      )}
    </div>
  );
}
