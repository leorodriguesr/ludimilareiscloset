export class ReshipmentError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ReshipmentError";
  }
}

export const ACTIVE_RESHIPMENT_STATUSES = [
  "TO_PACK",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
] as const;
