/** Uma linha de variação por peça do produto (tamanho/cor escolhidos). */
export type CartPieceSelection = {
  pieceName: string;
  size: string | null;
  color: string | null;
};

export type CartItem = {
  /** Identidade da linha no carrinho (produto + mesmas escolhas de peças). */
  lineId: string;
  productId: string;
  name: string;
  price: number;
  pixPrice?: number | null;
  installmentCount?: number | null;
  quantity: number;
  /** URL da imagem principal (pode ser vazia). */
  image: string;
  /** Vazio ou omitido quando o produto não tem peças/opções. */
  pieceSelections?: CartPieceSelection[];
};

export type CartState = {
  items: CartItem[];
};

/** Entrada para adicionar: quantidade padrão 1; `lineId` é calculado no reducer. */
export type AddToCartInput = Omit<CartItem, "quantity" | "lineId"> & {
  quantity?: number;
};
