/** Helpers de exibição para venda avulsa com dados do cliente pendentes. */

export const PENDING_ADMIN_SALE_CUSTOMER_LABEL = "Aguardando cliente";

export function isPendingAdminSaleCustomer(order: {
  orderSource?: string;
  customerDataStatus?: string | null;
  recipientName?: string | null;
}): boolean {
  return (
    order.orderSource === "ADMIN_SALE" &&
    order.customerDataStatus === "PENDING" &&
    !order.recipientName?.trim()
  );
}

/** Dados mínimos já preenchidos (admin ou cliente) — não oferecer link de completar. */
export function hasFilledAdminSaleCustomerData(order: {
  fulfillmentType?: string | null;
  recipientName?: string | null;
  phone?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  destinationCep?: string | null;
}): boolean {
  if (!order.recipientName?.trim()) return false;

  if (order.fulfillmentType === "ARRANGED") {
    return (order.phone ?? "").replace(/\D/g, "").length >= 10;
  }

  const cep = (order.destinationCep ?? "").replace(/\D/g, "");
  return Boolean(
    order.addressStreet?.trim() &&
      order.addressCity?.trim() &&
      order.addressState?.trim() &&
      cep.length === 8
  );
}

/** Link “completar dados” só quando ainda falta o preenchimento. */
export function shouldOfferCustomerDataFillLink(order: {
  orderSource?: string;
  customerDataStatus?: string | null;
  customerDataToken?: string | null;
  fulfillmentType?: string | null;
  recipientName?: string | null;
  phone?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  destinationCep?: string | null;
}): boolean {
  return (
    order.orderSource === "ADMIN_SALE" &&
    order.customerDataStatus === "PENDING" &&
    Boolean(order.customerDataToken) &&
    !hasFilledAdminSaleCustomerData(order)
  );
}

export function orderCustomerDisplayName(order: {
  orderSource?: string;
  customerDataStatus?: string | null;
  recipientName?: string | null;
  email?: string | null;
  user?: { name: string } | null;
}): string {
  if (isPendingAdminSaleCustomer(order)) {
    return PENDING_ADMIN_SALE_CUSTOMER_LABEL;
  }
  return (
    order.recipientName?.trim() ||
    order.user?.name ||
    order.email?.split("@")[0] ||
    "Cliente"
  );
}

export function orderCustomerDisplayEmail(order: {
  orderSource?: string;
  customerDataStatus?: string | null;
  recipientName?: string | null;
  email?: string | null;
}): string | null {
  if (isPendingAdminSaleCustomer(order)) return null;
  const email = order.email?.trim() || "";
  if (!email || email.endsWith("@venda-avulsa.local") || email.startsWith("pendente-")) {
    return null;
  }
  return email;
}
