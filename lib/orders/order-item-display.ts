/** Display de itens de pedido a partir do snapshot (com fallback ao catálogo). */

export type OrderItemDisplaySource = {
  productId?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  productImageUrl?: string | null;
  product?: {
    id?: string;
    name?: string;
    description?: string | null;
    images?: { url: string }[];
  } | null;
};

export function orderItemDisplayName(item: OrderItemDisplaySource): string {
  return (
    item.productName?.trim() ||
    item.product?.name?.trim() ||
    "Produto"
  );
}

export function orderItemDisplayDescription(
  item: OrderItemDisplaySource
): string | null {
  const fromSnapshot = item.productDescription?.trim();
  if (fromSnapshot) return fromSnapshot;
  const fromProduct = item.product?.description?.trim();
  return fromProduct || null;
}

export function orderItemDisplayImageUrl(
  item: OrderItemDisplaySource
): string | null {
  const fromSnapshot = item.productImageUrl?.trim();
  if (fromSnapshot) return fromSnapshot;
  return item.product?.images?.[0]?.url ?? null;
}

export function orderItemCatalogProductId(
  item: OrderItemDisplaySource
): string | null {
  return item.productId ?? item.product?.id ?? null;
}
