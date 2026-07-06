/**
 * Fase 7: migra pedidos pending_payment legados (duplicatas + expiresAt).
 * Uso:
 *   npm run db:migrate-legacy-pending -- --dry-run
 *   npm run db:migrate-legacy-pending
 */
import { migrateLegacyPendingOrders } from "../lib/orders/migrate-legacy-pending-orders";
import { prisma } from "../lib/prisma";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    console.log("Modo dry-run — nenhuma alteração será gravada.\n");
  }

  const result = await migrateLegacyPendingOrders({ dryRun });

  console.log("Migração de pedidos legados:");
  console.log(`  expiresAt preenchidos: ${result.backfilledExpiresAt}`);
  console.log(`  expirados por TTL:     ${result.expiredByTtl}`);
  console.log(`  duplicatas expiradas:  ${result.expiredDuplicates}`);
  console.log(`  pendentes mantidos:    ${result.keptPendingOrderIds.length}`);

  if (result.keptPendingOrderIds.length > 0) {
    console.log("\nIDs mantidos como pending_payment:");
    for (const id of result.keptPendingOrderIds) {
      console.log(`  - ${id}`);
    }
  }

  if (dryRun) {
    console.log("\nExecute sem --dry-run para aplicar.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
