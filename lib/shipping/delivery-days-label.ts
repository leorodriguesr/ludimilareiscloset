/** Rótulo de prazo de entrega (dias úteis). */
export function formatDeliveryDaysLabel(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  const a = min != null && min > 0 ? Math.floor(min) : 0;
  const b = max != null && max > 0 ? Math.floor(max) : 0;
  if (a <= 0 && b <= 0) return "—";
  if (a > 0 && b <= 0) return `${a} dia(s) útil(is)`;
  if (a <= 0 && b > 0) return `${b} dia(s) útil(is)`;
  return a === b ? `${a} dia(s) útil(is)` : `${a}–${b} dias úteis`;
}
