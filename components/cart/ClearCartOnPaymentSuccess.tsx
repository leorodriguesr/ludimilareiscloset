"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { clearCheckoutDraft } from "@/lib/checkout/draft-storage";

/** Limpa carrinho e rascunho do checkout após pagamento confirmado. */
export function ClearCartOnPaymentSuccess() {
  const { clear } = useCart();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    clear();
    clearCheckoutDraft();
  }, [clear]);

  return null;
}
