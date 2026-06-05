import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { resolveDbConnection } from "./db/target";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connection = resolveDbConnection();

/**
 * O mesmo adapter atende os três alvos: arquivo local (`file:`) e Turso
 * (`libsql://`). O alvo é definido por `DB_TARGET` (veja lib/db/target.ts).
 */
const adapter = new PrismaLibSql({
  url: connection.url,
  authToken: connection.authToken,
});

function createPrismaClient() {
  return new PrismaClient({ adapter });
}

const cached = globalForPrisma.prisma;
/** Delegates como `.user` só existem após `prisma generate`; cache antigo quebra o login. */
const cacheUsable =
  cached != null &&
  typeof (cached as { user?: { findUnique?: unknown } }).user?.findUnique ===
    "function";

if (cached != null && !cacheUsable) {
  void cached.$disconnect().catch(() => {});
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  if (connection.target !== "local") {
    console.warn(
      `[prisma] ATENÇÃO: ambiente local conectado ao banco "${connection.target}" (Turso). ` +
        `Escritas afetam dados reais. Use DB_TARGET=local para voltar ao banco local.`
    );
  }
}
