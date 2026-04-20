import { ProductCard } from "./ProductCard";

interface ProductImage {
  url: string;
}

interface ProductListItem {
  id: string;
  name: string;
  price: number;
  images: ProductImage[];
  tag?: string | null;
  categories?: { category: { name: string } }[];
}

interface ProductGridProps {
  products: ProductListItem[];
}

export function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-stone-400 text-lg">
          Nenhum produto nesta seleção.
        </p>
        <p className="text-stone-400 text-sm mt-2">
          Escolha outra categoria ou volte para todos.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 min-[401px]:gap-3 sm:gap-5 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          id={product.id}
          name={product.name}
          price={product.price}
          imageUrl={product.images[0]?.url ?? null}
          tag={product.tag}
          categoryLabel={
            product.categories?.[0]?.category.name ?? null
          }
        />
      ))}
    </div>
  );
}
