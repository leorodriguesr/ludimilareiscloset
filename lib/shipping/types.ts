/** Opção de frete normalizada — independente do provedor. */
export type NormalizedShippingOption = {
  /** Identificador estável para reutilizar na finalização do pedido (ex.: sf:3 | me:3). */
  id: string;
  /** Código numérico do serviço, quando disponível. */
  serviceId: number | null;
  carrierName: string;
  serviceName: string;
  price: number;
  /** Prazo em dias úteis (intervalo quando disponível). */
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  /** Pacotes retornados na cotação (Melhor Envio). */
  packages?: unknown[];
};

/** Caixa ideal calculada na cotação ao usar products[]. */
export type IdealPackage = {
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
};

export type ShippingQuoteResult = {
  options: NormalizedShippingOption[];
  idealPackage: IdealPackage | null;
  /** Provedor usado nesta cotação, quando aplicável. */
  provider?: "SUPERFRETE" | "MELHOR_ENVIO";
};

export type ShippingQuoteErrorCode =
  | "CONFIG"
  | "VALIDATION"
  | "UPSTREAM"
  | "PARSE";

export class ShippingQuoteError extends Error {
  readonly code: ShippingQuoteErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ShippingQuoteErrorCode,
    message: string,
    status = 500,
    details?: unknown
  ) {
    super(message);
    this.name = "ShippingQuoteError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type PackageDimensionsInput = {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};
