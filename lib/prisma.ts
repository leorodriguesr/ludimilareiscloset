import path from "node:path";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * SQLite com caminho relativo (file:./dev.db) depende do cwd do processo.
 * No Next.js o cwd costuma ser a raiz do projeto, mas normalizar para caminho
 * absoluto evita apontar para outro arquivo ou criar DB vazio sem tabelas.
 */
function resolveSqliteUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const rest = url.slice("file:".length);
  if (rest === ":memory:" || rest.includes("mode=memory")) return url;
  const withoutLeadingDot = rest.replace(/^\.\//, "");
  const absolute =
    path.isAbsolute(rest) || /^[A-Za-z]:[\\/]/.test(rest)
      ? rest
      : path.resolve(
          /* turbopackIgnore: true */ process.cwd(),
          withoutLeadingDot
        );
  return `file:${absolute}`;
}

const databaseUrl =
  process.env.DATABASE_URL != null
    ? resolveSqliteUrl(process.env.DATABASE_URL)
    : resolveSqliteUrl("file:./prisma/dev.db");

const adapter = new PrismaBetterSqlite3({
  url: databaseUrl,
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
}
