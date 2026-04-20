/** Include compartilhado para produto completo nas APIs e páginas. */
export const productFullInclude = {
  images: { orderBy: { order: "asc" as const } },
  pieces: {
    include: {
      colors: true,
      sizes: true,
      variants: {
        include: {
          color: true,
          size: true,
        },
      },
    },
  },
  categories: {
    include: {
      category: true,
    },
  },
} as const;

export const productListInclude = {
  images: { orderBy: { order: "asc" as const } },
  categories: {
    include: {
      category: true,
    },
  },
} as const;
