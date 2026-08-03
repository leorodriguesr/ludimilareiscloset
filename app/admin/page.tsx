"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ProductList } from "@/components/admin/ProductList";
import { ProductFormModal } from "@/components/admin/ProductFormModal";
import { BannerForm } from "@/components/admin/BannerForm";
import { CategoryManager } from "@/components/admin/CategoryManager";
import { SectionManager } from "@/components/admin/SectionManager";
import { SalesManager } from "@/components/admin/SalesManager";
import { ShippingManager } from "@/components/admin/ShippingManager";
import { ExchangeManager } from "@/components/admin/ExchangeManager";
import { StoreSettingsManager } from "@/components/admin/StoreSettingsManager";
import { UsersManager } from "@/components/admin/UsersManager";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Product } from "@/lib/types";

type AdminSection =
  | "products"
  | "sections"
  | "categories"
  | "banner"
  | "sales"
  | "shipping"
  | "exchanges"
  | "settings"
  | "users";

const ADMIN_SEARCH_INPUT_SIZE =
  "box-border h-9 text-sm font-medium leading-none sm:h-8";

const ADMIN_NAV_GROUPS: {
  title: string;
  items: { id: AdminSection; label: string }[];
}[] = [
  {
    title: "Operação",
    items: [
      { id: "products", label: "Produtos" },
      { id: "sales", label: "Vendas" },
      { id: "shipping", label: "Envios" },
      // { id: "exchanges", label: "Trocas" },
    ],
  },
  {
    title: "Vitrine",
    items: [
      { id: "sections", label: "Seções" },
      { id: "categories", label: "Categorias" },
      { id: "banner", label: "Banner" },
    ],
  },
  {
    title: "Loja",
    items: [
      { id: "settings", label: "Configurações" },
      { id: "users", label: "Usuários" },
    ],
  },
];

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function productMatchesSearch(product: Product, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const haystack = [
    product.name,
    product.tag ?? "",
    ...product.categories.map((pc) => pc.category.name),
    ...(product.sections ?? []).map((ps) => ps.section.name),
  ]
    .map(normalizeSearchText)
    .join(" ");

  return haystack.includes(normalizedQuery);
}

function AdminNavIcon({ id }: { id: AdminSection }) {
  const iconProps = {
    className: "h-4 w-4 shrink-0",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.5,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  switch (id) {
    case "products":
      return (
        <svg {...iconProps}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
      );
    case "sales":
      return (
        <svg {...iconProps}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
          />
        </svg>
      );
    case "shipping":
      return (
        <svg {...iconProps}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 12 3.269 3.125A59.769 59.769 0 0121.485 12 59.768 59.768 0 013.27 20.875L5.999 12zm0 0h7.5"
          />
        </svg>
      );
    case "exchanges":
      return (
        <svg {...iconProps}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
          />
        </svg>
      );
    case "sections":
      return (
        <svg {...iconProps}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
          />
        </svg>
      );
    case "categories":
      return (
        <svg {...iconProps}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
        </svg>
      );
    case "banner":
      return (
        <svg {...iconProps}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A1.5 1.5 0 0021.75 19.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
          />
        </svg>
      );
    case "settings":
      return (
        <svg {...iconProps}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "users":
      return (
        <svg {...iconProps}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
          />
        </svg>
      );
  }
}

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerMobileUrl, setBannerMobileUrl] = useState("");
  const [activeSection, setActiveSection] = useState<AdminSection>(() => {
    if (typeof window === "undefined") return "products";
    const section = new URLSearchParams(window.location.search).get("section");
    const allowed: AdminSection[] = [
      "products",
      "sections",
      "categories",
      "banner",
      "sales",
      "shipping",
      "exchanges",
      "settings",
      "users",
    ];
    return allowed.includes(section as AdminSection)
      ? (section as AdminSection)
      : "products";
  });
  const [showProductModal, setShowProductModal] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");

  const navGroups = useMemo(() => {
    if (isAdmin) return ADMIN_NAV_GROUPS;
    return ADMIN_NAV_GROUPS.filter((group) => group.title === "Operação");
  }, [isAdmin]);

  const allowedSections = useMemo(
    () => new Set(navGroups.flatMap((group) => group.items.map((item) => item.id))),
    [navGroups]
  );

  const filteredProducts = useMemo(() => {
    const query = productSearchQuery.trim();
    if (!query) return products;
    return products.filter((product) => productMatchesSearch(product, query));
  }, [products, productSearchQuery]);

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    const data: unknown = await res.json();
    if (Array.isArray(data)) {
      setProducts(data as Product[]);
    } else {
      console.error("[admin] Resposta inesperada de /api/products:", data);
      setProducts([]);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setBannerUrl(data.bannerImageUrl ?? "");
    setBannerMobileUrl(data.bannerMobileImageUrl ?? "");
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, [fetchProducts, fetchSettings]);

  useEffect(() => {
    setShowProductModal(false);
    setProductSearchQuery("");
  }, [activeSection]);

  useEffect(() => {
    if (!allowedSections.has(activeSection)) {
      setActiveSection("products");
    }
  }, [allowedSections, activeSection]);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="px-4 pt-6 pb-4 md:hidden">
        <h1 className="text-lg font-semibold leading-tight text-stone-900">
          Painel Admin
        </h1>
      </div>

      <aside className="sticky top-14 z-40 flex w-full shrink-0 items-center border-b border-stone-200 bg-white/95 backdrop-blur-sm sm:top-16 md:fixed md:left-0 md:top-16 md:z-30 md:block md:h-[calc(100dvh-4rem)] md:w-56 md:items-stretch md:overflow-y-auto md:border-b-0 md:border-r md:border-stone-200 md:bg-white md:px-0 md:py-8 md:backdrop-blur-none">
        <div className="hidden md:block md:px-4 md:pb-8">
          <h1 className="text-xl font-semibold leading-tight text-stone-900">
            Painel Admin
          </h1>
        </div>
        <nav
          className="flex w-full items-center gap-0 overflow-x-auto px-4 py-2.5 md:block md:overflow-visible md:border-t-0 md:px-0 md:py-0"
          aria-label="Seções do painel"
        >
          {navGroups.map((group, groupIndex) => (
            <div
              key={group.title}
              className="flex shrink-0 items-center md:block md:shrink md:pb-4 md:last:pb-0"
            >
              {groupIndex > 0 && (
                <div
                  className="mx-1.5 h-6 w-px shrink-0 bg-stone-200 md:hidden"
                  aria-hidden
                />
              )}
              <div className="md:px-1">
                <p className="hidden px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400 md:block">
                  {group.title}
                </p>
                <div className="flex gap-1 md:flex-col md:gap-0.5">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSection(item.id)}
                      aria-current={activeSection === item.id ? "page" : undefined}
                      className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors md:w-full md:py-2.5 ${activeSection === item.id
                          ? "bg-emerald-100 text-emerald-900 shadow-sm ring-1 ring-emerald-200/80 md:relative md:bg-slate-100 md:text-stone-900 md:shadow-none md:ring-0 md:after:absolute md:after:right-0 md:after:top-1/2 md:after:h-9 md:after:w-1 md:after:-translate-y-1/2 md:after:bg-stone-900"
                          : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                        }`}
                    >
                      <AdminNavIcon id={item.id} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 px-4 py-8 md:ml-56 md:px-10 ">
        {activeSection === "products" && (
          <div>
            <div className="mb-6 flex flex-col gap-4 sm:mb-8">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">
                  Produtos cadastrados
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {productSearchQuery.trim()
                    ? `${filteredProducts.length} de ${products.length} ${products.length === 1 ? "produto" : "produtos"
                    }`
                    : `${products.length} ${products.length === 1 ? "produto" : "produtos"
                    } no catálogo`}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <label className="relative w-full min-w-[9.5rem] shrink-0 sm:w-72 lg:w-90">
                  <span className="sr-only">Buscar produtos</span>
                  <svg
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                    />
                  </svg>
                  <input
                    type="text"
                    inputMode="search"
                    value={productSearchQuery}
                    onChange={(event) =>
                      setProductSearchQuery(event.target.value)
                    }
                    placeholder="Buscar produto por nome, categoria ou seção"
                    className={`w-full rounded-lg border border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 ${ADMIN_SEARCH_INPUT_SIZE} pl-8 ${productSearchQuery.trim() ? "pr-8" : "pr-3"}`}
                  />
                  {productSearchQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => setProductSearchQuery("")}
                      aria-label="Limpar busca"
                      className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18 18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  ) : null}
                </label>

                <button
                  type="button"
                  onClick={() => setShowProductModal(true)}
                  className={`inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-sky-100 px-3 text-xs font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 sm:w-auto ${ADMIN_SEARCH_INPUT_SIZE}`}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  Adicionar produto
                </button>
              </div>
            </div>

            <ProductList
              products={filteredProducts}
              onRefresh={fetchProducts}
              emptyKind={
                products.length > 0 && productSearchQuery.trim()
                  ? "search"
                  : "catalog"
              }
              searchQuery={productSearchQuery.trim()}
            />

            <ProductFormModal
              open={showProductModal}
              onClose={() => setShowProductModal(false)}
              onSuccess={fetchProducts}
            />
          </div>
        )}

        {activeSection === "sales" && (
          <section>
            <SalesManager />
          </section>
        )}

        {activeSection === "shipping" && (
          <section>
            <ShippingManager />
          </section>
        )}

        {activeSection === "exchanges" && (
          <section>
            <ExchangeManager />
          </section>
        )}

        {activeSection === "sections" && isAdmin && (
          <section>
            <h2 className="text-lg font-medium text-stone-900 mb-4">
              Seções da vitrine
            </h2>
            <p className="text-sm text-stone-500 mb-6">
              Seções são vitrines temáticas exibidas na página inicial (ex:
              Promoção, Lançamentos, Mais Vendidos). Reordene-as para
              controlar a ordem de exibição.
            </p>
            <SectionManager onSectionsChange={fetchProducts} />
          </section>
        )}

        {activeSection === "categories" && isAdmin && (
          <section>
            <h2 className="text-lg font-medium text-stone-900 mb-4">
              Categorias da loja
            </h2>
            <p className="text-sm text-stone-500 mb-6">
              As categorias aparecem como filtro na página inicial. Ao
              cadastrar um produto, marque em quais categorias ele entra.
            </p>
            <CategoryManager onCategoriesChange={fetchProducts} />
          </section>
        )}

        {activeSection === "banner" && isAdmin && (
          <section>
            <h2 className="text-lg font-medium text-stone-900 mb-4">
              Configuração do Banner
            </h2>
            <div className="rounded-xl border border-stone-200 bg-white p-6">
              <BannerForm
                currentUrl={bannerUrl}
                currentMobileUrl={bannerMobileUrl}
                onSuccess={fetchSettings}
              />
            </div>
          </section>
        )}

        {activeSection === "settings" && isAdmin && (
          <section>
            <h2 className="text-lg font-medium text-stone-900 mb-2">
              Configurações da loja
            </h2>
            <p className="text-sm text-stone-500 mb-6">
              Defina regras de frete grátis, prazo de embalagem e outras preferências gerais da loja.
            </p>
            <StoreSettingsManager />
          </section>
        )}

        {activeSection === "users" && isAdmin && (
          <section>
            <UsersManager />
          </section>
        )}
      </main>
    </div>
  );
}
