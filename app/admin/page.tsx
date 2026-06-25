"use client";

import { useEffect, useState, useCallback } from "react";
import { ProductForm } from "@/components/admin/ProductForm";
import { ProductList } from "@/components/admin/ProductList";
import { BannerForm } from "@/components/admin/BannerForm";
import { CategoryManager } from "@/components/admin/CategoryManager";
import { SectionManager } from "@/components/admin/SectionManager";
import { SalesManager } from "@/components/admin/SalesManager";
import { ShippingManager } from "@/components/admin/ShippingManager";
import { StoreSettingsManager } from "@/components/admin/StoreSettingsManager";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { Product } from "@/lib/types";

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [bannerUrl, setBannerUrl] = useState("");
  const [activeSection, setActiveSection] = useState<
    "products" | "sections" | "categories" | "banner" | "sales" | "shipping" | "settings"
  >("products");
  const [showProductForm, setShowProductForm] = useState(false);

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
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, [fetchProducts, fetchSettings]);

  useEffect(() => {
    setShowProductForm(false);
  }, [activeSection]);

  const navItems = [
    { id: "products" as const, label: "Produtos" },
    { id: "sales" as const, label: "Vendas" },
    { id: "shipping" as const, label: "Envios" },
    { id: "sections" as const, label: "Seções" },
    { id: "categories" as const, label: "Categorias" },
    { id: "banner" as const, label: "Banner" },
    { id: "settings" as const, label: "Configurações" },
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      <aside className="sticky top-16 z-30 w-full shrink-0 border-b border-stone-200 bg-white px-4 py-6 md:fixed md:left-0 md:top-16 md:z-30 md:h-[calc(100dvh-4rem)] md:w-56 md:overflow-y-auto md:border-b-0 md:border-r md:border-stone-200 md:px-0 md:py-8">
          <div className="px-4 pb-6 md:pb-8">
            <h1 className="text-lg font-semibold leading-tight text-stone-900 md:text-xl">
              Painel Admin
            </h1>
            <LogoutButton className="mt-4 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 md:mt-6">
              Sair
            </LogoutButton>
          </div>
          <nav
            className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:gap-0.5 md:overflow-visible md:px-2 md:pb-0"
            aria-label="Seções do painel"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`shrink-0 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors md:w-full ${
                  activeSection === item.id
                    ? "bg-stone-100 text-stone-900"
                    : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
      </aside>

      <main className="min-w-0 px-4 py-8 md:ml-56 md:px-10 ">
          {activeSection === "products" && (
            <div>
              <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-medium text-stone-900">
                  Produtos Cadastrados ({products.length})
                </h2>
                {showProductForm ? (
                  <button
                    type="button"
                    onClick={() => setShowProductForm(false)}
                    className="shrink-0 self-start rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 sm:self-auto"
                  >
                    Cancelar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowProductForm(true)}
                    className="shrink-0 self-end rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 sm:self-auto"
                  >
                    Adicionar Produto
                  </button>
                )}
              </div>

              {showProductForm && (
                <section className="mb-10">
                  <h3 className="mb-4 text-base font-medium text-stone-900">
                    Novo Produto
                  </h3>
                  <div className="rounded-xl border border-stone-200 bg-white p-6">
                    <ProductForm
                      onSuccess={async () => {
                        await fetchProducts();
                        setShowProductForm(false);
                      }}
                    />
                  </div>
                </section>
              )}

              <ProductList products={products} onRefresh={fetchProducts} />
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

          {activeSection === "sections" && (
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

          {activeSection === "categories" && (
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

          {activeSection === "banner" && (
            <section>
              <h2 className="text-lg font-medium text-stone-900 mb-4">
                Configuração do Banner
              </h2>
              <div className="rounded-xl border border-stone-200 bg-white p-6">
                <BannerForm currentUrl={bannerUrl} onSuccess={fetchSettings} />
              </div>
            </section>
          )}

          {activeSection === "settings" && (
            <section>
              <h2 className="text-lg font-medium text-stone-900 mb-2">
                Configurações da loja
              </h2>
              <p className="text-sm text-stone-500 mb-6">
                Defina regras de frete grátis e outras preferências gerais da loja.
              </p>
              <StoreSettingsManager />
            </section>
          )}
      </main>
    </div>
  );
}
