"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Category {
  id: string;
  name: string;
}

interface CategoryFilterProps {
  categories: Category[];
}

export function CategoryFilter({ categories }: CategoryFilterProps) {
  const searchParams = useSearchParams();
  const active = searchParams.get("c");

  if (categories.length === 0) return null;

  return (
    <div className="mb-10 flex flex-wrap items-center justify-center gap-2">
      <Link
        href="/"
        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          !active
            ? "bg-stone-900 text-white"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
        }`}
      >
        Todos
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat.id}
          href={`/?c=${encodeURIComponent(cat.id)}`}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            active === cat.id
              ? "bg-stone-900 text-white"
              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
          }`}
        >
          {cat.name}
        </Link>
      ))}
    </div>
  );
}
