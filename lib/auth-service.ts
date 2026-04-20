import bcrypt from "bcryptjs";
import { UserRole } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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
  return { ok: true as const, user };
}

export type LoginIntent = "client" | "admin";

export type GoogleProfileInput = {
  googleId: string;
  email: string;
  name: string;
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

  const existingGoogle = await prisma.user.findUnique({
    where: { googleId },
  });
  if (existingGoogle) {
    if (existingGoogle.role !== UserRole.CLIENT) {
      return { ok: false as const, code: "admin_google" as const };
    }
    if (name && name !== existingGoogle.name) {
      const user = await prisma.user.update({
        where: { id: existingGoogle.id },
        data: { name },
      });
      return { ok: true as const, user };
    }
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
      },
    });
    return { ok: true as const, user };
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      phone: "—",
      googleId,
      passwordHash: null,
      role: UserRole.CLIENT,
    },
  });
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
  if (intent === "admin" && user.role !== UserRole.ADMIN) {
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
  return {
    ok: true as const,
    user: {
      id: user.id,
      role: user.role === UserRole.ADMIN ? ("ADMIN" as const) : ("CLIENT" as const),
      name: user.name,
      email: user.email,
    },
  };
}
