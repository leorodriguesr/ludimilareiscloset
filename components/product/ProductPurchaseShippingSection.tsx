"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductPurchaseActions } from "@/components/product/ProductPurchaseActions";
import { ProductShippingQuote } from "@/components/product/ProductShippingQuote";
import type { PieceSelectionMap } from "@/lib/product-piece-selection";
import type { ProductPiece, StockType } from "@/lib/types";

type Props = {
  productId: string;
  name: string;
  price: number;
  pixPrice?: number | null;
  installmentCount?: number | null;
  imageUrl: string;
  stockType: StockType;
  stockQuantity: number | null;
  pieces?: ProductPiece[];
  selections?: PieceSelectionMap;
  /** Quando há peças, indica se tamanho/cor estão válidos para compra. */
  optionsComplete?: boolean;
};

export function ProductPurchaseShippingSection(props: Props) {
  const {
    productId,
    stockType,
    stockQuantity,
    pieces,
    selections,
    optionsComplete = true,
  } = props;

  const maxQty = useMemo(() => {
    if (stockType === "LIMITED") {
      return Math.max(0, stockQuantity ?? 0);
    }
    return 99;
  }, [stockType, stockQuantity]);

  const [qty, setQty] = useState(1);
  const available = maxQty > 0;
  const cap = Math.max(1, maxQty || 1);
  const safeQty = Math.min(qty, cap);

  useEffect(() => {
    setQty((q) => Math.min(cap, Math.max(1, q)));
  }, [cap]);

  const hasPieces = Boolean(pieces?.length);
  const canPurchase = available && (!hasPieces || optionsComplete);

  return (
    <div className="space-y-4">
      <ProductPurchaseActions
        productId={props.productId}
        name={props.name}
        price={props.price}
        pixPrice={props.pixPrice}
        installmentCount={props.installmentCount}
        imageUrl={props.imageUrl}
        quantity={available ? safeQty : 0}
        maxQty={maxQty}
        onQuantityChange={setQty}
        pieces={pieces}
        selections={selections}
        canPurchase={canPurchase}
      />
      <ProductShippingQuote
        productId={productId}
        quantity={available ? safeQty : 1}
        productPrice={props.price}
      />
    </div>
  );
}
