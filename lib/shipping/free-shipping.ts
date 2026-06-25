export interface FreeShippingSettings {
  freeShippingEnabled: boolean;
  freeShippingType: string;
  freeShippingMinValue: number;
}

export interface FreeShippingResult {
  /** Frete grátis ativo para este carrinho */
  isFree: boolean;
  /** Valor que falta para atingir o mínimo (null se não aplicável ou já atingido) */
  missingAmount: number | null;
  /** Valor mínimo configurado (null se não aplicável) */
  minValue: number | null;
}

/**
 * Verifica se o carrinho qualifica para frete grátis com base nas configurações da loja.
 */
export function checkFreeShipping(
  settings: FreeShippingSettings,
  cartTotal: number,
): FreeShippingResult {
  if (!settings.freeShippingEnabled) {
    return { isFree: false, missingAmount: null, minValue: null };
  }

  if (settings.freeShippingType === "always") {
    return { isFree: true, missingAmount: null, minValue: null };
  }

  const min = settings.freeShippingMinValue;
  if (cartTotal >= min) {
    return { isFree: true, missingAmount: null, minValue: min };
  }

  const missing = Math.max(0, min - cartTotal);
  return { isFree: false, missingAmount: missing, minValue: min };
}
