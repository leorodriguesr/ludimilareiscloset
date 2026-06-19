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
