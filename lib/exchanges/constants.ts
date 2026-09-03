import type {
  ExchangeBalanceStatus,
  ExchangeItemDisposition,
  ExchangeKind,
  ExchangeReason,
  ExchangeShippingPaidBy,
  ExchangeStatus,
} from "@/app/generated/prisma/client";

export const EXCHANGE_KIND_LABELS: Record<ExchangeKind, string> = {
  EXCHANGE: "Troca",
  RETURN: "Devolução",
};

export const EXCHANGE_STATUS_LABELS: Record<ExchangeStatus, string> = {
  AWAITING_RETURN: "Aguardando retorno",
  RETURN_IN_TRANSIT: "Retorno em trânsito",
  RECEIVED: "Peça conferida",
  READY_OUTBOUND: "Pronto para reenvio",
  OUTBOUND: "Reenvio em andamento",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const EXCHANGE_REASON_LABELS: Record<ExchangeReason, string> = {
  SIZE: "Tamanho",
  COLOR: "Cor",
  DEFECT: "Defeito",
  REGRET: "Arrependimento",
  WRONG_PRODUCT: "Produto errado",
  OTHER: "Outro",
};

export const EXCHANGE_DISPOSITION_LABELS: Record<
  ExchangeItemDisposition,
  string
> = {
  RESELLABLE: "Apta para venda",
  DAMAGED: "Avaria",
  DISCARD: "Descarte",
  INTERNAL_USE: "Uso interno",
};

export const EXCHANGE_BALANCE_STATUS_LABELS: Record<
  ExchangeBalanceStatus,
  string
> = {
  NONE: "Sem saldo",
  PENDING: "Aguardando pagamento",
  PAID: "Pago",
  WAIVED: "Dispensado",
  CREDIT_PENDING: "Crédito pendente",
  SETTLED: "Quitado",
};

export const EXCHANGE_PAID_BY_LABELS: Record<ExchangeShippingPaidBy, string> = {
  STORE: "Loja",
  CUSTOMER: "Cliente",
};

export const EXCHANGE_REASONS = Object.keys(
  EXCHANGE_REASON_LABELS
) as ExchangeReason[];

export const EXCHANGE_DISPOSITIONS = Object.keys(
  EXCHANGE_DISPOSITION_LABELS
) as ExchangeItemDisposition[];

export class ExchangeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ExchangeError";
  }
}
