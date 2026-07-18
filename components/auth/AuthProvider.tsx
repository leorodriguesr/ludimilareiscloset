"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  hasPermission as roleHasPermission,
  isStaffRole,
  type AppRole,
  type Permission,
} from "@/lib/auth/permissions";

export type AuthUser = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: AppRole;
  createdAt: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  isGestor: boolean;
  isStaff: boolean;
  hasPermission: (permission: Permission) => boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function parseRole(raw: unknown): AppRole | null {
  if (raw === "ADMIN" || raw === "GESTOR" || raw === "CLIENT") return raw;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = (await res.json()) as {
        user?: {
          id: string;
          name: string | null;
          email: string;
          phone: string | null;
          role: string;
          createdAt: string;
        } | null;
      };
      const role = parseRole(data.user?.role);
      if (!data.user || !role) {
        setUser(null);
        return;
      }
      setUser({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        phone: data.user.phone,
        role,
        createdAt: data.user.createdAt,
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const onAuth = () => {
      void refresh();
    };
    window.addEventListener("auth:login", onAuth);
    window.addEventListener("auth:logout", onAuth);
    return () => {
      window.removeEventListener("auth:login", onAuth);
      window.removeEventListener("auth:logout", onAuth);
    };
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => {
    const role = user?.role ?? null;
    return {
      user,
      loading,
      isAdmin: role === "ADMIN",
      isGestor: role === "GESTOR",
      isStaff: role != null && isStaffRole(role),
      hasPermission: (permission: Permission) =>
        role != null ? roleHasPermission(role, permission) : false,
      refresh,
    };
  }, [user, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return ctx;
}
