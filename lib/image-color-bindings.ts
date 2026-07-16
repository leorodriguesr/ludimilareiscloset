/** Marcador interno: vínculo legado (string simples) sem nome de peça. */
const LEGACY_KEY = "*";

export type ImageColorBindings = Record<string, string>;

/**
 * Lê `ProductImage.colorName`:
 * - legado: `"Verde"` → `{ "*": "Verde" }`
 * - multi-peça: `{"Calça":"Verde","Blusa":"Rosa"}`
 */
export function parseImageColorBindings(
  colorName: string | null | undefined
): ImageColorBindings {
  const raw = colorName?.trim();
  if (!raw) return {};

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      const out: ImageColorBindings = {};
      for (const [piece, color] of Object.entries(
        parsed as Record<string, unknown>
      )) {
        const pieceName = piece.trim();
        const colorNameValue =
          typeof color === "string" ? color.trim() : "";
        if (!pieceName || !colorNameValue) continue;
        out[pieceName] = colorNameValue;
      }
      return out;
    } catch {
      return { [LEGACY_KEY]: raw };
    }
  }

  return { [LEGACY_KEY]: raw };
}

/** Serializa vínculos. Uma peça → string simples; várias → JSON. */
export function serializeImageColorBindings(
  bindings: ImageColorBindings
): string | null {
  const entries = Object.entries(bindings).filter(
    ([piece, color]) => piece.trim() && color.trim()
  );
  if (entries.length === 0) return null;

  if (entries.length === 1) {
    const [piece, color] = entries[0]!;
    // Legado sem peça nomeada → string simples
    if (piece === LEGACY_KEY) return color.trim();
    // Peça nomeada → JSON para não perder o vínculo ao adicionar outra peça
    return JSON.stringify({ [piece.trim()]: color.trim() });
  }

  const obj: ImageColorBindings = {};
  for (const [piece, color] of entries) {
    obj[piece.trim()] = color.trim();
  }
  return JSON.stringify(obj);
}

export function imageMatchesColorSwatch(
  colorName: string | null | undefined,
  selectedColor: string
): boolean {
  const bindings = parseImageColorBindings(colorName);
  return Object.values(bindings).some((c) => c === selectedColor);
}

/**
 * Índice da foto que melhor casa com as cores selecionadas por peça.
 * Retorna -1 se nenhuma foto servir.
 */
export function findBestImageIndex(
  images: { colorName?: string | null }[],
  selectedByPiece: Record<string, string | null | undefined>
): number {
  const active = Object.entries(selectedByPiece)
    .map(([piece, color]) => [piece.trim(), color] as const)
    .filter(
      ([piece, color]) =>
        piece.length > 0 && typeof color === "string" && color.trim().length > 0
    ) as [string, string][];

  if (active.length === 0) return -1;

  const selectedNorm: Record<string, string> = {};
  for (const [piece, color] of active) {
    selectedNorm[piece] = color.trim();
  }

  let bestIdx = -1;
  let bestScore = -1;
  let bestCoversAll = false;
  let bestBindingCount = -1;

  for (let i = 0; i < images.length; i++) {
    const bindings = parseImageColorBindings(images[i]?.colorName);
    const keys = Object.keys(bindings);
    if (keys.length === 0) continue;

    let score = 0;
    let mismatch = false;

    const isLegacy = keys.length === 1 && keys[0] === LEGACY_KEY;
    if (isLegacy) {
      const legacyColor = bindings[LEGACY_KEY]!;
      const anyMatch = active.some(([, color]) => color === legacyColor);
      if (!anyMatch) continue;
      score = active.filter(([, color]) => color === legacyColor).length;
    } else {
      // Toda peça já escolhida que a foto define precisa bater
      for (const [piece, boundColor] of Object.entries(bindings)) {
        const selected = selectedNorm[piece];
        if (selected == null) continue;
        if (selected === boundColor) {
          score += 1;
        } else {
          mismatch = true;
          break;
        }
      }
      if (mismatch || score === 0) continue;
    }

    const coversAll = score === active.length;
    const bindingCount = keys.length;
    const better =
      score > bestScore ||
      (score === bestScore && coversAll && !bestCoversAll) ||
      (score === bestScore &&
        coversAll === bestCoversAll &&
        bindingCount > bestBindingCount);

    if (better) {
      bestScore = score;
      bestCoversAll = coversAll;
      bestBindingCount = bindingCount;
      bestIdx = i;
    }
  }

  return bestIdx;
}

export function setPieceColorBinding(
  currentColorName: string | null | undefined,
  pieceName: string,
  colorName: string | null
): string | null {
  const bindings = parseImageColorBindings(currentColorName);
  // Remove legado genérico ao começar a vincular por peça nomeada
  if (LEGACY_KEY in bindings && pieceName !== LEGACY_KEY) {
    delete bindings[LEGACY_KEY];
  }
  const key = pieceName.trim();
  if (!key) return serializeImageColorBindings(bindings);

  if (!colorName?.trim()) {
    delete bindings[key];
  } else {
    bindings[key] = colorName.trim();
  }
  return serializeImageColorBindings(bindings);
}

export function getPieceColorBinding(
  colorName: string | null | undefined,
  pieceName: string
): string {
  const bindings = parseImageColorBindings(colorName);
  return bindings[pieceName.trim()] ?? bindings[LEGACY_KEY] ?? "";
}
