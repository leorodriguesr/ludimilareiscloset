"use client";

import { useState } from "react";

interface ShareButtonProps {
  productId: string;
  productName: string;
}

export function ShareButton({ productId, productName }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const url = `${window.location.origin}/products/${productId}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: productName, url });
      } catch {
        // Usuário cancelou
      }
      return;
    }

    // Fallback: copia URL
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignora
    }
  }

  return (
    <button
      type="button"
      aria-label="Compartilhar produto"
      onClick={handleShare}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 shadow-sm backdrop-blur-sm transition-transform hover:scale-110 active:scale-95"
    >
      {copied ? (
        <svg className="h-4 w-4 stroke-emerald-600" fill="none" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="h-4 w-4 stroke-white" fill="none" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
        </svg>
      )}
    </button>
  );
}
