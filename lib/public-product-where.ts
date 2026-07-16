/** Apenas produtos marcados como visíveis no site entram na vitrine/busca. */
export const publicCatalogProductWhere = {
  visibleOnSite: true,
} as const;
