export type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  /** URL da imagem principal (pode ser vazia). */
  image: string;
};

export type CartState = {
  items: CartItem[];
};

/** Entrada para adicionar: quantidade padrão 1. */
export type AddToCartInput = Omit<CartItem, "quantity"> & {
  quantity?: number;
};
