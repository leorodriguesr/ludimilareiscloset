import Link from "next/link";
import { cloudinaryImageUrl } from "@/lib/images/cloudinary-url";

type CategoryShowcaseItem = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export function HomeCategoryShowcase({
  categories,
}: {
  categories: CategoryShowcaseItem[];
}) {
  return (
    <section id="category-showcase" aria-label="Categorias">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category, index) => (
          <Link
            key={category.id}
            href={`/?c=${encodeURIComponent(category.id)}`}
            className="group relative aspect-[3/4] overflow-hidden bg-stone-200"
            aria-label={`Ver produtos da categoria ${category.name}`}
          >
            {category.imageUrl ? (
              <img
                src={cloudinaryImageUrl(category.imageUrl, 900)}
                alt=""
                width={900}
                height={1200}
                loading={index < 2 ? "eager" : "lazy"}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_top,#efe7e4,#c7b8b4)]" />
            )}

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-100 via-stone-100/80 to-transparent px-5 pb-6 pt-24">
              <div className="flex items-center gap-3 text-stone-900">
                <h3 className="text-lg font-semibold uppercase tracking-[0.08em] sm:text-xl">
                  {category.name}
                </h3>
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </div>
              <span className="mt-3 inline-flex rounded-full border border-stone-500/70 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-800">
                Ver mais
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
