import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { resolveDbConnection, type DbTarget } from "../lib/db/target";

/**
 * Aplica as migrations do Prisma em um banco Turso (staging/produção).
 *
 * O Prisma Migrate só roda contra arquivo local, então geramos as migrations
 * com `prisma migrate dev` e usamos este script para aplicar o SQL no Turso.
 * Idempotente: cada migration é registrada na tabela `_lrc_migrations` e só
 * é aplicada uma vez.
 *
 * Uso:
 *   tsx scripts/turso-migrate.ts staging
 *   tsx scripts/turso-migrate.ts production
 */
const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma/migrations");
const TRACKING_TABLE = "_lrc_migrations";

function parseTarget(): DbTarget {
  const arg = process.argv[2]?.trim().toLowerCase();
  if (arg !== "staging" && arg !== "production" && arg !== "local") {
    throw new Error(
      `Alvo inválido: "${arg ?? ""}". Use: staging | production | local.`
    );
  }
  return arg;
}

function listMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => {
      const full = path.join(MIGRATIONS_DIR, entry);
      return statSync(full).isDirectory();
    })
    .sort()
    .map((name) => {
      const file = path.join(MIGRATIONS_DIR, name, "migration.sql");
      return { name, sql: readFileSync(file, "utf8") };
    });
}

/** Divide o SQL em statements, ignorando comentários de linha. */
function splitSqlStatements(sql: string): string[] {
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlockComments
    .split(";")
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !/^\s*--/.test(line))
        .join("\n")
        .trim()
    )
    .filter(Boolean);
}

function isIgnorableAlreadyAppliedError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("duplicate column name") ||
    lower.includes("already exists") ||
    lower.includes("duplicate column")
  );
}

async function applyMigrationSql(client: Client, sql: string, migrationName: string) {
  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    try {
      await client.execute(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isIgnorableAlreadyAppliedError(message)) {
        console.warn(
          `[turso-migrate] Já aplicado (ok): ${migrationName}\n  → ${statement.slice(0, 120)}…`
        );
        continue;
      }
      console.error(
        `[turso-migrate] Statement falhou em ${migrationName}:\n${statement}`
      );
      throw error;
    }
  }
}

async function main() {
  const target = parseTarget();
  const connection = resolveDbConnection(target);

  console.log(`[turso-migrate] Alvo: ${target} (${connection.url})`);

  const client = createClient({
    url: connection.url,
    authToken: connection.authToken,
  });

  await client.executeMultiple(
    `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     );`
  );

  const appliedRows = await client.execute(
    `SELECT name FROM ${TRACKING_TABLE};`
  );
  const applied = new Set(appliedRows.rows.map((row) => String(row.name)));

  const migrations = listMigrations();
  const pending = migrations.filter((m) => !applied.has(m.name));

  if (pending.length === 0) {
    console.log("[turso-migrate] Nada a aplicar — banco já está atualizado.");
    client.close();
    return;
  }

  for (const migration of pending) {
    console.log(`[turso-migrate] Aplicando: ${migration.name}`);
    await applyMigrationSql(client, migration.sql, migration.name);
    await client.execute({
      sql: `INSERT INTO ${TRACKING_TABLE} (name) VALUES (?);`,
      args: [migration.name],
    });
  }

  console.log(
    `[turso-migrate] Concluído. ${pending.length} migration(s) aplicada(s).`
  );
  client.close();
}

main().catch((error) => {
  console.error("[turso-migrate] Falhou:", error);
  process.exit(1);
});
