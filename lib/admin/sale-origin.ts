import { OrderSource, type Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Mesma regra da listagem de Vendas: checkout, Admin, Avulsa ou primeiro nome. */
export function orderOriginWhere(origin: string | null): Prisma.OrderWhereInput {
  const label = origin?.trim() ?? "";
  if (!label) return {};
  if (label === "checkout") {
    return { orderSource: OrderSource.CHECKOUT };
  }
  if (label === "Admin") {
    return {
      orderSource: OrderSource.ADMIN_SALE,
      createdBy: { role: "ADMIN" },
    };
  }
  if (label === "Avulsa") {
    return {
      orderSource: OrderSource.ADMIN_SALE,
      OR: [{ createdByUserId: null }, { createdBy: { is: { name: "" } } }],
    };
  }
  return {
    orderSource: OrderSource.ADMIN_SALE,
    createdBy: { name: { startsWith: label } },
  };
}

export async function collectSaleOrigins(): Promise<string[]> {
  const rows = await prisma.order.findMany({
    where: { orderSource: OrderSource.ADMIN_SALE },
    select: { createdBy: { select: { name: true, role: true } } },
    take: 400,
  });
  const labels = new Set<string>(["checkout"]);
  for (const row of rows) {
    if (row.createdBy?.role === "ADMIN") labels.add("Admin");
    const first = row.createdBy?.name?.trim().split(/\s+/)[0];
    if (first) labels.add(first);
    else labels.add("Avulsa");
  }
  const preferred = ["checkout", "Admin", "Avulsa"];
  const rest = [...labels]
    .filter((label) => !preferred.includes(label))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...preferred.filter((label) => labels.has(label)), ...rest];
}
