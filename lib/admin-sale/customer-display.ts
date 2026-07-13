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
