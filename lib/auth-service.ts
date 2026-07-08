import bcrypt from "bcryptjs";
import { UserRole } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { claimGuestOrders } from "@/lib/orders/claim-guest-orders";
import { isStaffRole } from "@/lib/auth/permissions";

const SALT_ROUNDS = 12;

export type RegisterInput = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function registerClient(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false as const, error: "Este e-mail já está cadastrado." };
  }
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      phone: input.phone.trim(),
      passwordHash,
      role: UserRole.CLIENT,
    },
  });
  await claimGuestOrders(user.id, user.email);
  return { ok: true as const, user };
}

export type LoginIntent = "client" | "admin";

export type GoogleProfileInput = {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
};

/**
 * Cria cliente novo, ou associa `googleId` a conta existente (mesmo e-mail, role CLIENT).
 * Contas ADMIN não entram por Google.
 */
export async function signInOrLinkGoogleUser(input: GoogleProfileInput) {
  const email = input.email.trim().toLowerCase();
  const googleId = input.googleId.trim();
  const name =
    input.name.trim() ||
    email.split("@")[0] ||
    "Cliente";
  const picture = input.picture?.trim() || undefined;

  const existingGoogle = await prisma.user.findUnique({
    where: { googleId },
  });
  if (existingGoogle) {
    if (existingGoogle.role !== UserRole.CLIENT) {
      return { ok: false as const, code: "admin_google" as const };
    }
    const nameChanged = name && name !== existingGoogle.name;
    const pictureChanged = picture && picture !== existingGoogle.picture;
    if (nameChanged || pictureChanged) {
      const user = await prisma.user.update({
        where: { id: existingGoogle.id },
        data: {
          ...(nameChanged ? { name } : {}),
          ...(pictureChanged ? { picture } : {}),
        },
      });
      await claimGuestOrders(user.id, user.email);
      return { ok: true as const, user };
    }
    await claimGuestOrders(existingGoogle.id, existingGoogle.email);
    return { ok: true as const, user: existingGoogle };
  }

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    if (byEmail.role !== UserRole.CLIENT) {
      return { ok: false as const, code: "admin_google" as const };
    }
    const user = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId,
        name: name || byEmail.name,
        picture: picture ?? byEmail.picture,
      },
    });
    await claimGuestOrders(user.id, user.email);
    return { ok: true as const, user };
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      phone: "—",
      googleId,
      picture,
      passwordHash: null,
      role: UserRole.CLIENT,
    },
  });
  await claimGuestOrders(user.id, user.email);
  return { ok: true as const, user };
}

export async function authenticateUser(
  emailRaw: string,
  password: string,
  intent: LoginIntent
) {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: false as const, error: "E-mail ou senha incorretos." };
  }
  if (user.passwordHash == null) {
    return {
      ok: false as const,
      error: "Esta conta usa login com o Google. Use o botão “Continuar com Google”.",
    };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { ok: false as const, error: "E-mail ou senha incorretos." };
  }
  if (intent === "admin" && !isStaffRole(user.role)) {
    return {
      ok: false as const,
      error: "Acesso negado. Use o login da loja para entrar como cliente.",
    };
  }
  if (intent === "client" && user.role !== UserRole.CLIENT) {
    return {
      ok: false as const,
      error: "Use o painel administrativo para entrar com esta conta.",
    };
  }
  await claimGuestOrders(user.id, user.email);
  const sessionRole =
    user.role === UserRole.ADMIN
      ? ("ADMIN" as const)
      : user.role === UserRole.GESTOR
        ? ("GESTOR" as const)
        : ("CLIENT" as const);
  return {
    ok: true as const,
    user: {
      id: user.id,
      role: sessionRole,
      name: user.name,
      email: user.email,
    },
  };
}
