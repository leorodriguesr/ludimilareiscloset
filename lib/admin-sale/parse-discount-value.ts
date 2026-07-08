/** Converte valor digitado (pt-BR ou en-US) em número para descontos. */
export function parseDiscountInputValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 0 ? raw : null;
  }
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim().replace(/[^\d,.-]/g, "");
  if (!trimmed) return null;

  let normalized = trimmed;
  if (trimmed.includes(",")) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, "");
  }

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}
