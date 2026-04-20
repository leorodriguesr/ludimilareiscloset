import Link from "next/link";
import { formatPrice } from "@/lib/format";

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  tag?: string | null;
  categoryLabel?: string | null;
}

export function ProductCard({
  id,
  name,
  price,
  imageUrl,
  tag,
  categoryLabel,
}: ProductCardProps) {
  return (
    <Link href={`/products/${id}`} className="group">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-stone-300">
            <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {tag && (
          <span className="absolute top-3 left-3 bg-stone-900 text-white text-[10px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full">
            {tag}
          </span>
        )}
      </div>
      <div className="mt-4 space-y-1">
        {categoryLabel && (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">
            {categoryLabel}
          </p>
        )}
        <h3 className="text-sm font-medium text-stone-900 group-hover:text-stone-600 transition-colors">
          {name}
        </h3>
        <p className="text-sm font-semibold text-stone-900">
          {formatPrice(price)}
        </p>
      </div>
    </Link>
  );
}
