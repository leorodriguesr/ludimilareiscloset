"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function HeaderGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (
    pathname?.startsWith("/checkout") ||
    pathname?.startsWith("/venda-avulsa")
  ) {
    return null;
  }
  return children;
}
