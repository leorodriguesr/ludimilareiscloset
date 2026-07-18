import type { CartPieceSelection } from "@/lib/cart/types";

export function serializePieceSelections(
  selections: CartPieceSelection[] | undefined | null
): string | null {
  if (!selections?.length) return null;
  return JSON.stringify(selections);
}

export function parsePieceSelections(
  json: string | null | undefined
): CartPieceSelection[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        if (typeof r.pieceName !== "string") return null;
        return {
          pieceName: r.pieceName,
          size: typeof r.size === "string" ? r.size : null,
          color: typeof r.color === "string" ? r.color : null,
        } satisfies CartPieceSelection;
      })
      .filter((x): x is CartPieceSelection => x != null);
  } catch {
    return [];
  }
}
