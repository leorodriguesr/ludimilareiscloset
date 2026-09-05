import type { AppRole } from "@/lib/auth/permissions";

export type AdminSection =
  | "dashboard"
  | "products"
  | "sections"
  | "categories"
  | "banner"
  | "sales"
  | "shipping"
  | "exchanges"
  | "settings"
  | "users";

export type AdminNavGroup = {
  title: string;
  items: { id: AdminSection; label: string }[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: "Operação",
    items: [
      { id: "dashboard", label: "Dashboard" },
      { id: "products", label: "Produtos" },
      { id: "sales", label: "Vendas" },
      { id: "shipping", label: "Envios" },
      { id: "exchanges", label: "Trocas" },
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

/** Gestor opera o dia a dia; vitrine, loja e trocas ficam só com o admin. */
export function visibleAdminNavGroups(
  role: AppRole | null
): AdminNavGroup[] {
  if (role === "ADMIN") return ADMIN_NAV_GROUPS;
  return ADMIN_NAV_GROUPS.filter((group) => group.title === "Operação").map(
    (group) => ({
      ...group,
      items: group.items.filter((item) => item.id !== "exchanges"),
    })
  );
}

export function canAccessAdminSection(
  role: AppRole | null,
  section: AdminSection
): boolean {
  return visibleAdminNavGroups(role).some((group) =>
    group.items.some((item) => item.id === section)
  );
}
