import { prisma } from "@/lib/prisma";
import { ORDER_STATUS } from "@/lib/orders/constants";
import {
  buildMetaCustomerListCsv,
  type MetaCustomerOrder,
} from "@/lib/admin/meta-customer-list";

export async function loadMetaCustomerListCsv(): Promise<{
  csv: string;
  customers: number;
}> {
  const orders = await prisma.order.findMany({
    where: {
      status: ORDER_STATUS.PAID,
      paidAt: { not: null },
    },
    select: {
      userId: true,
      email: true,
      phone: true,
      conversationPhone: true,
      recipientName: true,
      destinationCep: true,
      addressCity: true,
      addressState: true,
      total: true,
      paidAt: true,
      user: { select: { email: true, phone: true, name: true } },
    },
  });

  const rows: MetaCustomerOrder[] = orders.map((order) => ({
    userId: order.userId,
    email: order.email,
    userEmail: order.user?.email ?? null,
    phone: order.phone,
    conversationPhone: order.conversationPhone,
    userPhone: order.user?.phone ?? null,
    recipientName: order.recipientName,
    userName: order.user?.name ?? null,
    cep: order.destinationCep,
    city: order.addressCity,
    state: order.addressState,
    total: order.total,
    paidAt: order.paidAt,
  }));

  return buildMetaCustomerListCsv(rows);
}
