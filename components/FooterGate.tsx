"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/Footer";

export function FooterGate() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/checkout")) return null;
  return <Footer />;
}
