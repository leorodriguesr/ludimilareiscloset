export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface ProductCategoryLink {
  productId: string;
  categoryId: string;
  category: Category;
}

export interface ProductImage {
  id: string;
  url: string;
  order: number;
}

export interface PieceColor {
  id: string;
  name: string;
  hex: string | null;
}

export interface PieceSize {
  id: string;
  name: string;
}

export interface PieceVariant {
  id: string;
  quantity: number;
  colorId: string;
  sizeId: string;
  color: PieceColor;
  size: PieceSize;
}

export interface ProductPiece {
  id: string;
  name: string;
  colors: PieceColor[];
  sizes: PieceSize[];
  variants: PieceVariant[];
}

export type StockType = "UNLIMITED" | "LIMITED";

export interface Product {
  id: string;
  name: string;
  price: number;
  installmentCount: number | null;
  pixPrice: number | null;
  costPrice: number | null;
  description: string | null;
  tag: string | null;
  videoUrl: string | null;
  stockType: StockType;
  stockQuantity: number | null;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  images: ProductImage[];
  pieces: ProductPiece[];
  categories: ProductCategoryLink[];
  createdAt: string;
}
