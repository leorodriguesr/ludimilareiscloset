/** Valor mínimo de seguro para PAC e SEDEX (Correios via SuperFrete). */
export const SUPERFRETE_MIN_INSURANCE_PAC_SEDEX_BRL = 25.63;

/** Valor mínimo de seguro para Mini Envios. */
export const SUPERFRETE_MIN_INSURANCE_MINI_BRL = 12.82;

const MIN_BY_SERVICE: Record<number, number> = {
  1: SUPERFRETE_MIN_INSURANCE_PAC_SEDEX_BRL,
  2: SUPERFRETE_MIN_INSURANCE_PAC_SEDEX_BRL,
  17: SUPERFRETE_MIN_INSURANCE_MINI_BRL,
};

/** Jadlog e Loggi exigem que insurance_value = total declarado em products[]. */
const EXACT_INSURANCE_SERVICES = new Set([3, 31]);

/** Melhor Envio e SuperFrete recusam unitary_value 0 (brinde, cortesia). */
export const MIN_DECLARED_UNIT_VALUE_BRL = 0.01;

export function declaredUnitValue(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MIN_DECLARED_UNIT_VALUE_BRL;
  return Math.round(value * 100) / 100;
}

export function declaredProductsTotal(
  products: { unitary_value: number; quantity: number }[]
): number {
  const total = products.reduce(
    (sum, product) => sum + product.unitary_value * product.quantity,
    0
  );
  return Math.round(total * 100) / 100;
}

/**
 * Loggi/Jadlog exigem o seguro igual à soma declarada.
 * Nos demais, mantém o valor pedido quando ele já cobre a declaração.
 */
export function insuranceMatchingDeclaration(
  serviceId: number,
  declaredTotal: number,
  requested: number
): number {
  if (EXACT_INSURANCE_SERVICES.has(serviceId)) return declaredTotal;
  const base = Number.isFinite(requested) ? Math.max(0, requested) : 0;
  return Math.round(Math.max(base, declaredTotal) * 100) / 100;
}

export function minInsuranceForService(serviceId: number): number | null {
  return MIN_BY_SERVICE[serviceId] ?? null;
}

export function serviceLabelForInsurance(serviceId: number): string {
  switch (serviceId) {
    case 1:
      return "PAC";
    case 2:
      return "SEDEX";
    case 17:
      return "Mini Envios";
    case 3:
      return "Jadlog";
    case 31:
      return "Loggi";
    default:
      return `serviço ${serviceId}`;
  }
}

/**
 * Normaliza seguro para SuperFrete.
 * - Abaixo do mínimo (PAC/SEDEX/Mini): sem seguro (`null`).
 * - Jadlog/Loggi: seguro = total dos produtos.
 */
export function normalizeSuperfreteInsurance(
  declaredValue: number,
  serviceId?: number
): {
  insuranceValue: number | null;
  useInsurance: boolean;
} {
  const rounded = Math.max(0, Math.round(declaredValue * 100) / 100);
  if (rounded <= 0) {
    return { insuranceValue: null, useInsurance: false };
  }

  if (serviceId != null && EXACT_INSURANCE_SERVICES.has(serviceId)) {
    return { insuranceValue: rounded, useInsurance: true };
  }

  const minimum =
    serviceId != null ? minInsuranceForService(serviceId) : SUPERFRETE_MIN_INSURANCE_PAC_SEDEX_BRL;

  if (minimum != null && rounded < minimum) {
    return { insuranceValue: null, useInsurance: false };
  }

  return { insuranceValue: rounded, useInsurance: true };
}
