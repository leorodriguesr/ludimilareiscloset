"use client";

import { useEffect, useState } from "react";
import type { FreeShippingSettings } from "@/lib/shipping/free-shipping";

export interface StoreSettingsPublic extends FreeShippingSettings {
  bannerImageUrl: string;
}

let cache: StoreSettingsPublic | null = null;
let fetchPromise: Promise<StoreSettingsPublic> | null = null;

async function fetchSettings(): Promise<StoreSettingsPublic> {
  if (cache) return cache;
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/api/settings")
    .then((r) => r.json() as Promise<StoreSettingsPublic>)
    .then((data) => {
      cache = data;
      fetchPromise = null;
      return data;
    })
    .catch(() => {
      fetchPromise = null;
      return {
        bannerImageUrl: "",
        freeShippingEnabled: false,
        freeShippingType: "minimum_value",
        freeShippingMinValue: 0,
      } as StoreSettingsPublic;
    });
  return fetchPromise;
}

/** Invalida o cache em memória (usar após salvar configurações no admin). */
export function invalidateSettingsCache() {
  cache = null;
  fetchPromise = null;
}

export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettingsPublic | null>(cache);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    if (cache) {
      setSettings(cache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchSettings().then((data) => {
      if (!cancelled) {
        setSettings(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, loading };
}
