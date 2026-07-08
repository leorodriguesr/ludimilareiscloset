import { UserRole } from "@/app/generated/prisma/client";

export const PERMISSION = {
  USERS_MANAGE: "users.manage",
  PRODUCTS_MANAGE: "products.manage",
  SALES_MANAGE: "sales.manage",
  ADMIN_SALE_CREATE: "admin_sale.create",
  SHIPPING_MANAGE: "shipping.manage",
  SETTINGS_MANAGE: "settings.manage",
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

const ALL_PERMISSIONS: readonly Permission[] = [
  PERMISSION.USERS_MANAGE,
  PERMISSION.PRODUCTS_MANAGE,
  PERMISSION.SALES_MANAGE,
  PERMISSION.ADMIN_SALE_CREATE,
  PERMISSION.SHIPPING_MANAGE,
  PERMISSION.SETTINGS_MANAGE,
];

/** Mapa role → permissões. Ajustar GESTOR aqui quando restringir acesso. */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.ADMIN]: ALL_PERMISSIONS,
  [UserRole.GESTOR]: ALL_PERMISSIONS,
  [UserRole.CLIENT]: [],
};

export function isStaffRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.GESTOR;
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
