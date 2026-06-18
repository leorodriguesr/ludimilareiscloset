"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";
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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const pathname = usePathname();

  const syncAuth = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: unknown }) => {
        const isLogged = !!d.user;
        setLoggedIn(isLogged);
        if (isLogged) {
          return fetch("/api/favorites")
            .then((r) => r.json())
            .then((ids: string[]) => setFavorites(new Set(ids)));
        } else {
          setFavorites(new Set());
        }
      })
      .catch(() => {
        setLoggedIn(false);
        setFavorites(new Set());
      });
  }, []);

  // Re-verifica auth e recarrega favoritos sempre que a rota muda
  // (cobre logout, login e navegação entre páginas)
  useEffect(() => {
    syncAuth();
  }, [pathname, syncAuth]);

  // Escuta login via Google One Tap (não muda pathname, só faz router.refresh)
  useEffect(() => {
    window.addEventListener("auth:login", syncAuth);
    return () => window.removeEventListener("auth:login", syncAuth);
  }, [syncAuth]);

  const toggle = useCallback(
    async (productId: string) => {
      if (!loggedIn) {
        setShowLoginModal(true);
        return;
      }

      // Optimistic update
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

        // Sessão expirou enquanto a página estava aberta
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
        // Reverte update otimista em caso de erro
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
