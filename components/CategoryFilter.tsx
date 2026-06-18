"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
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
  const prevActive = useRef<string | null>(null);

  useEffect(() => {
    if (active && active !== prevActive.current) {
      const el = document.getElementById("produtos");
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 40;
        window.scrollTo({ top, behavior: "smooth" });
      }
    }
    prevActive.current = active;
  }, [active]);

  if (categories.length === 0) return null;

  return (
    <div className="sticky top-14 z-40 -mx-2 border-b border-stone-100 bg-white/95 backdrop-blur-sm min-[401px]:-mx-3 sm:-mx-4 sm:top-16">
      <div className=" flex max-w-7xl items-center overflow-x-auto px-2 scrollbar-hide min-[401px]:px-3 sm:px-4 md:px-6">
        <Link
          href="/"
          scroll={false}
          replace
          className={`relative shrink-0 px-4 py-3.5 text-xs font-medium uppercase tracking-widest transition-colors sm:px-5 ${
            !active
              ? "text-stone-900 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-stone-900"
              : "text-stone-400 hover:text-stone-700"
          }`}
        >
          Todos
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/?c=${encodeURIComponent(cat.id)}`}
            scroll={false}
            replace
            className={`relative shrink-0 px-4 py-3.5 text-xs font-medium uppercase tracking-widest transition-colors sm:px-5 ${
              active === cat.id
                ? "text-stone-900 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-stone-900"
                : "text-stone-400 hover:text-stone-700"
            }`}
          >
            {cat.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
