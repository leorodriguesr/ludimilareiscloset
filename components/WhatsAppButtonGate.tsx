"use client";

import { usePathname } from "next/navigation";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export function WhatsAppButtonGate() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <WhatsAppButton />;
}
