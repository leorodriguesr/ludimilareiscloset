import path from "node:path";

/**
 * Alvos de banco suportados:
 * - `local`: arquivo SQLite na máquina (desenvolvimento).
 * - `staging`: banco Turso de homologação.
 * - `production`: banco Turso de produção.
 *
 * O alvo é escolhido pela env `DB_TARGET`. Em desenvolvimento local você pode
 * setar `DB_TARGET=staging` para trabalhar com os dados reais do staging.
 */
export type DbTarget = "local" | "staging" | "production";

export type DbConnection = {
  target: DbTarget;
  /** URL aceita pelo cliente libSQL: `file:...` (local) ou `libsql://...` (Turso). */
  url: string;
  /** Token de autenticação (obrigatório para Turso, ausente para arquivo local). */
  authToken?: string;
};

const VALID_TARGETS: readonly DbTarget[] = ["local", "staging", "production"];

export function resolveDbTarget(): DbTarget {
  const raw = process.env.DB_TARGET?.trim().toLowerCase();
  if (raw == null || raw === "") return "local";
  if (!VALID_TARGETS.includes(raw as DbTarget)) {
    throw new Error(
      `DB_TARGET inválido: "${raw}". Use um de: ${VALID_TARGETS.join(", ")}.`
    );
  }
  return raw as DbTarget;
}

/**
 * SQLite por arquivo depende do cwd do processo. No Next.js o cwd costuma ser a
 * raiz do projeto, mas normalizar para caminho absoluto evita apontar para outro
 * arquivo ou criar um DB vazio sem tabelas.
 */
function resolveLocalFileUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const rest = url.slice("file:".length);
  if (rest === ":memory:" || rest.includes("mode=memory")) return url;
  const withoutLeadingDot = rest.replace(/^\.\//, "");
  const absolute =
    path.isAbsolute(rest) || /^[A-Za-z]:[\\/]/.test(rest)
      ? rest
      : path.resolve(process.cwd(), withoutLeadingDot);
  return `file:${absolute}`;
}

function requireEnv(name: string, target: DbTarget): string {
  const value = process.env[name]?.trim();
  if (value == null || value === "") {
    throw new Error(
      `Variável de ambiente "${name}" é obrigatória para DB_TARGET=${target}. ` +
        `Configure-a no .env (local) ou nos segredos do host (deploy).`
    );
  }
  return value;
}

export function resolveDbConnection(
  target: DbTarget = resolveDbTarget()
): DbConnection {
  if (target === "local") {
    const url =
      process.env.LOCAL_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      "file:./dev.db";
    return { target, url: resolveLocalFileUrl(url) };
  }

  const prefix = target === "staging" ? "STAGING" : "PRODUCTION";
  return {
    target,
    url: requireEnv(`${prefix}_DATABASE_URL`, target),
    authToken: requireEnv(`${prefix}_DATABASE_TOKEN`, target),
  };
}
