import type { CSSProperties } from "react";

/** Hex especial para bolinha metade preto / metade branco. */
export const MESCLADO_BW_HEX = "mesclado-bw";

export function colorSwatchStyle(
  hex: string | null | undefined
): CSSProperties {
  if (hex === MESCLADO_BW_HEX) {
    return {
      backgroundImage: "linear-gradient(135deg, #000000 50%, #ffffff 50%)",
    };
  }
  const value = hex?.trim();
  return { backgroundColor: value || "#e7e5e4" };
}

/** Normaliza #RGB / #RRGGBB (com ou sem #). */
export function normalizeHexColor(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) return null;
  return v.toUpperCase();
}
