import {
  CustomerDataStatus,
  type Order,
} from "@/app/generated/prisma/client";

export function isCustomerDataComplete(order: {
  customerDataStatus: CustomerDataStatus | null;
  recipientName: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  destinationCep: string | null;
}): boolean {
  if (order.customerDataStatus === CustomerDataStatus.COMPLETE) return true;
  const cep = (order.destinationCep ?? "").replace(/\D/g, "");
  return Boolean(
    order.recipientName?.trim() &&
      order.addressStreet?.trim() &&
      order.addressCity?.trim() &&
      order.addressState?.trim() &&
      cep.length === 8
  );
}

/** Hook pós-pagamento (reservado para automações futuras). */
export async function onOrderPaymentConfirmed(_order: {
  id: string;
  fulfillmentType: Order["fulfillmentType"];
  customerDataStatus: CustomerDataStatus | null;
  recipientName: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  destinationCep: string | null;
}): Promise<void> {
  // Etiqueta SuperFrete só após marcar como embalada no admin.
}
