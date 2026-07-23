/** Roles da aplicação (sem importar Prisma — seguro no client). */
export type AppRole = "ADMIN" | "GESTOR" | "CLIENT";

export const PERMISSION = {
  USERS_MANAGE: "users.manage",
  PRODUCTS_MANAGE: "products.manage",
  SALES_MANAGE: "sales.manage",
  ADMIN_SALE_CREATE: "admin_sale.create",
  /** Registrar venda avulsa já paga (manual) — só admin. */
  ADMIN_SALE_MARK_PAID: "admin_sale.mark_paid",
  SHIPPING_MANAGE: "shipping.manage",
  EXCHANGES_MANAGE: "exchanges.manage",
  SETTINGS_MANAGE: "settings.manage",
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

const ALL_PERMISSIONS: readonly Permission[] = [
  PERMISSION.USERS_MANAGE,
  PERMISSION.PRODUCTS_MANAGE,
  PERMISSION.SALES_MANAGE,
  PERMISSION.ADMIN_SALE_CREATE,
  PERMISSION.ADMIN_SALE_MARK_PAID,
  PERMISSION.SHIPPING_MANAGE,
  PERMISSION.EXCHANGES_MANAGE,
  PERMISSION.SETTINGS_MANAGE,
];

/** Mapa role → permissões. */
export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  /** Operação: produtos, vendas, envios e trocas — sem vitrine/loja (config e usuários). */
  GESTOR: [
    PERMISSION.PRODUCTS_MANAGE,
    PERMISSION.SALES_MANAGE,
    PERMISSION.ADMIN_SALE_CREATE,
    PERMISSION.SHIPPING_MANAGE,
    PERMISSION.EXCHANGES_MANAGE,
  ],
  CLIENT: [],
};

export function isStaffRole(role: AppRole | string): boolean {
  return role === "ADMIN" || role === "GESTOR";
}

export function hasPermission(
  role: AppRole | string,
  permission: Permission
): boolean {
  if (role !== "ADMIN" && role !== "GESTOR" && role !== "CLIENT") return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}
