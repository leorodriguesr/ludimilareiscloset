import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { resolveDbConnection } from "./db/target";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  /** Bump quando campos do schema mudam (ex.: endereço/CPF em Order). */
  prismaSchemaGeneration?: number;
};

/** Incremente após `prisma generate` que adiciona/altera campos usados em runtime. */
const PRISMA_SCHEMA_GENERATION = 20260905121;

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
/** Delegates como `.user` e `.section` só existem após `prisma generate`; cache antigo quebra delegates novos. */
const cacheUsable =
  cached != null &&
  globalForPrisma.prismaSchemaGeneration === PRISMA_SCHEMA_GENERATION &&
  typeof (cached as { user?: { findUnique?: unknown } }).user?.findUnique ===
    "function" &&
  typeof (cached as { section?: { findMany?: unknown } }).section?.findMany ===
    "function" &&
  typeof (cached as { favorite?: { findMany?: unknown } }).favorite?.findMany ===
    "function" &&
  typeof (cached as { exchange?: { findMany?: unknown } }).exchange?.findMany ===
    "function" &&
  typeof (cached as { cashLedgerEntry?: { aggregate?: unknown } })
    .cashLedgerEntry?.aggregate === "function";

if (cached != null && !cacheUsable) {
  void cached.$disconnect().catch(() => {});
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaGeneration = PRISMA_SCHEMA_GENERATION;
  if (connection.target !== "local") {
    console.warn(
      `[prisma] ATENÇÃO: ambiente local conectado ao banco "${connection.target}" (Turso). ` +
        `Escritas afetam dados reais. Use DB_TARGET=local para voltar ao banco local.`
    );
  }
}
