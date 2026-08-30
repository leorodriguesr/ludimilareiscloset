"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginPromptModal } from "./LoginPromptModal";

interface FavoritesContextValue {
  favorites: Set<string>;
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => Promise<void>;
  count: number;
}

const FavoritesContext = createContext<FavoritesContextValue>({
  favorites: new Set(),
  isFavorite: () => false,
  toggle: async () => {},
  count: 0,
});

export function useFavorites() {
  return useContext(FavoritesContext);
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setLoggedIn(false);
      setFavorites(new Set());
      return;
    }

    setLoggedIn(true);
    let cancelled = false;
    void fetch("/api/favorites")
      .then((r) => r.json())
      .then((ids: string[]) => {
        if (!cancelled && Array.isArray(ids)) setFavorites(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setFavorites(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  const toggle = useCallback(
    async (productId: string) => {
      if (!loggedIn) {
        setShowLoginModal(true);
        return;
      }

      setFavorites((prev) => {
        const next = new Set(prev);
        if (next.has(productId)) next.delete(productId);
        else next.add(productId);
        return next;
      });

      try {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        });

        if (res.status === 401) {
          setLoggedIn(false);
          setFavorites(new Set());
          setShowLoginModal(true);
          return;
        }

        const data: { favorited?: boolean; error?: string } = await res.json();
        if (!res.ok) throw new Error(data.error);

        setFavorites((prev) => {
          const next = new Set(prev);
          if (data.favorited) next.add(productId);
          else next.delete(productId);
          return next;
        });
      } catch {
        setFavorites((prev) => {
          const next = new Set(prev);
          if (next.has(productId)) next.delete(productId);
          else next.add(productId);
          return next;
        });
      }
    },
    [loggedIn]
  );

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isFavorite: (id) => favorites.has(id),
        toggle,
        count: favorites.size,
      }}
    >
      {children}
      {showLoginModal && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}
    </FavoritesContext.Provider>
  );
}
