"use client";

import { useEffect, useMemo, useState } from "react";
import { PieceSelector } from "@/components/product/PieceSelector";
import { ProductPurchaseShippingSection } from "@/components/product/ProductPurchaseShippingSection";
import {
  emptyPieceSelections,
  pieceSelectionsAreComplete,
  type PieceSelectionMap,
} from "@/lib/product-piece-selection";
import type { ProductPiece, StockType } from "@/lib/types";

type Props = {
  productId: string;
  name: string;
  price: number;
  pixPrice?: number | null;
  installmentCount?: number | null;
  coverImage: string;
  stockType: StockType;
  stockQuantity: number | null;
  allowBackorder: boolean;
  restockLeadDays: number | null;
  pieces: ProductPiece[];
};

export function ProductSummaryPurchaseClient({
  pieces,
  coverImage,
  ...purchase
}: Props) {
  const pieceKey = useMemo(() => pieces.map((p) => p.id).join("|"), [pieces]);

  const [selections, setSelections] = useState<PieceSelectionMap>(() =>
    emptyPieceSelections(pieces)
  );

  useEffect(() => {
    setSelections(emptyPieceSelections(pieces));
  }, [pieceKey]);

  const optionsComplete = pieceSelectionsAreComplete(
    pieces,
    selections,
    purchase.allowBackorder
  );

  return (
    <>
      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">
          Opções
        </p>
        <PieceSelector
          pieces={pieces}
          selections={selections}
          onSelectionsChange={setSelections}
          allowBackorder={purchase.allowBackorder}
        />
      </div>

      <div className="space-y-4 ">
        <ProductPurchaseShippingSection
          {...purchase}
          imageUrl={coverImage}
          pieces={pieces}
          selections={selections}
          optionsComplete={optionsComplete}
        />
      </div>
    </>
  );
}
