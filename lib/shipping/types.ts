/** Opção de frete normalizada — independente do provedor (SuperFrete, etc.). */
export type NormalizedShippingOption = {
  /** Identificador estável para reutilizar na finalização do pedido (ex.: sf:3). */
  id: string;
  /** Código numérico do serviço SuperFrete, quando disponível. */
  serviceId: number | null;
  carrierName: string;
  serviceName: string;
  price: number;
  /** Prazo em dias úteis (intervalo quando disponível). */
  deliveryDaysMin: number;
  deliveryDaysMax: number;
};

/** Caixa ideal calculada pela SuperFrete ao usar products[]. */
export type IdealPackage = {
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
};

export type ShippingQuoteResult = {
  options: NormalizedShippingOption[];
  idealPackage: IdealPackage | null;
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
