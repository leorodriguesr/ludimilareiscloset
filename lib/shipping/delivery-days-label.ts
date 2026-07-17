function businessDaysCount(n: number): string {
  return n === 1 ? "1 dia útil" : `${n} dias úteis`;
}

/** Intervalo de dias úteis, sem prefixo (ex.: "3 a 5 dias úteis"). */
export function formatBusinessDaysRange(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  const a = min != null && min > 0 ? Math.floor(min) : 0;
  const b = max != null && max > 0 ? Math.floor(max) : 0;
  if (a <= 0 && b <= 0) return null;
  if (a > 0 && b <= 0) return businessDaysCount(a);
  if (a <= 0 && b > 0) return `até ${businessDaysCount(b)}`;
  if (a === b) return businessDaysCount(a);
  return `${a} a ${b} dias úteis`;
}

/** Um único prazo: o maior entre min e max (ex.: "5 dias úteis"). */
export function formatMaxBusinessDays(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  const a = min != null && min > 0 ? Math.floor(min) : 0;
  const b = max != null && max > 0 ? Math.floor(max) : 0;
  const n = Math.max(a, b);
  if (n <= 0) return null;
  return businessDaysCount(n);
}

/** Rótulo compacto para admin (tabelas, painel). */
export function formatDeliveryDaysLabel(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  return formatBusinessDaysRange(min, max) ?? "—";
}

/** Rótulo para vitrine/checkout — deixa claro que o prazo é estimado. */
export function formatEstimatedDeliveryLabel(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  const range = formatBusinessDaysRange(min, max);
  if (!range) return "Prazo a confirmar após a postagem";
  return `${range}`;
}

/** Variante curta para listas inline (ex.: "PAC · 3 a 5 dias úteis (estimativa)"). */
export function formatEstimatedDeliveryInline(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  const range = formatBusinessDaysRange(min, max);
  if (!range) return "prazo a confirmar";
  return `${range} (estimativa)`;
}
