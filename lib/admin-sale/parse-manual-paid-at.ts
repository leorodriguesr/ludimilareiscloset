const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function saoPauloCalendarDate(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Interpreta `YYYY-MM-DD` no fuso de São Paulo.
 * Recusa data futura. Sem valor válido, devolve null.
 */
export function parseManualPaidAtDate(
  raw: unknown,
  now = new Date()
): Date | null {
  if (typeof raw !== "string" || !DATE_RE.test(raw.trim())) return null;
  const date = raw.trim();
  const paidAt = new Date(`${date}T12:00:00.000-03:00`);
  if (Number.isNaN(paidAt.getTime())) return null;
  if (date > saoPauloCalendarDate(now)) return null;
  return paidAt;
}
