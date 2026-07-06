/** Rascunho do checkout em sessionStorage — preserva formulário ao voltar do pagamento. */

import type { CartItem } from "@/lib/cart/types";
import { parseStoredCart } from "@/lib/cart/storage";

export const CHECKOUT_DRAFT_KEY = "ludimila-reis:checkout-draft";

const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CheckoutDraftContact = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
};

export type CheckoutDraftShipping = {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  optionId: string;
  optionLabel: string;
  optionPrice: number;
  deliveryLabel: string;
  optionIsFree?: boolean;
};

export type CheckoutDraftPix = {
  orderId: string;
  pixCode: string;
  pixQrBase64: string | null;
  expiresAt: string;
  amount: number;
};

export type CheckoutDraft = {
  contact: CheckoutDraftContact;
  shipping: CheckoutDraftShipping;
  step: number;
  paymentMethod: "pix" | "card" | null;
  contactDone: boolean;
  deliveryDone: boolean;
  pendingPayment: boolean;
  pixData?: CheckoutDraftPix | null;
  cartItems?: CartItem[];
  savedAt: number;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

function parseDraft(raw: string | null): CheckoutDraft | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data)) return null;
    const savedAt = Number(data.savedAt);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > DRAFT_MAX_AGE_MS) {
      return null;
    }
    const contact = data.contact;
    const shipping = data.shipping;
    if (!isRecord(contact) || !isRecord(shipping)) return null;

    const step = Number(data.step);
    const paymentMethod =
      data.paymentMethod === "pix" || data.paymentMethod === "card"
        ? data.paymentMethod
        : null;

    let pixData: CheckoutDraftPix | null = null;
    if (isRecord(data.pixData)) {
      const p = data.pixData;
      if (
        typeof p.orderId === "string" &&
        typeof p.pixCode === "string" &&
        typeof p.expiresAt === "string" &&
        typeof p.amount === "number"
      ) {
        pixData = {
          orderId: p.orderId,
          pixCode: p.pixCode,
          pixQrBase64:
            typeof p.pixQrBase64 === "string" ? p.pixQrBase64 : null,
          expiresAt: p.expiresAt,
          amount: p.amount,
        };
      }
    }

    let cartItems: CartItem[] | undefined;
    if (Array.isArray(data.cartItems) && data.cartItems.length > 0) {
      const parsed = parseStoredCart(
        JSON.stringify({ items: data.cartItems })
      );
      if (parsed?.items.length) cartItems = parsed.items;
    }

    return {
      contact: {
        name: typeof contact.name === "string" ? contact.name : "",
        email: typeof contact.email === "string" ? contact.email : "",
        phone: typeof contact.phone === "string" ? contact.phone : "",
        cpf: typeof contact.cpf === "string" ? contact.cpf : "",
      },
      shipping: {
        cep: typeof shipping.cep === "string" ? shipping.cep : "",
        street: typeof shipping.street === "string" ? shipping.street : "",
        number: typeof shipping.number === "string" ? shipping.number : "",
        complement:
          typeof shipping.complement === "string" ? shipping.complement : "",
        neighborhood:
          typeof shipping.neighborhood === "string"
            ? shipping.neighborhood
            : "",
        city: typeof shipping.city === "string" ? shipping.city : "",
        state: typeof shipping.state === "string" ? shipping.state : "",
        optionId:
          typeof shipping.optionId === "string" ? shipping.optionId : "",
        optionLabel:
          typeof shipping.optionLabel === "string" ? shipping.optionLabel : "",
        optionPrice: Number(shipping.optionPrice) || 0,
        deliveryLabel:
          typeof shipping.deliveryLabel === "string"
            ? shipping.deliveryLabel
            : "",
        ...(shipping.optionIsFree === true ? { optionIsFree: true } : {}),
      },
      step: Number.isFinite(step) && step >= 1 && step <= 3 ? step : 1,
      paymentMethod,
      contactDone: data.contactDone === true,
      deliveryDone: data.deliveryDone === true,
      pendingPayment: data.pendingPayment === true,
      pixData,
      ...(cartItems ? { cartItems } : {}),
      savedAt,
    };
  } catch {
    return null;
  }
}

export function readCheckoutDraft(): CheckoutDraft | null {
  if (typeof window === "undefined") return null;
  try {
    return parseDraft(window.sessionStorage.getItem(CHECKOUT_DRAFT_KEY));
  } catch {
    return null;
  }
}

export function writeCheckoutDraft(draft: Omit<CheckoutDraft, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CheckoutDraft = { ...draft, savedAt: Date.now() };
    window.sessionStorage.setItem(
      CHECKOUT_DRAFT_KEY,
      JSON.stringify(payload)
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearCheckoutDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
