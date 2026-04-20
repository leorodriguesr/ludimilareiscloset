import type { SessionOptions } from "iron-session";

export const SESSION_COOKIE_NAME = "ludimila_session";

export type SessionUser = {
  userId: string;
  role: "ADMIN" | "CLIENT";
};

export type AppSessionData = {
  user?: SessionUser;
};

export function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (password == null || password.length < 32) {
    throw new Error(
      "SESSION_SECRET deve estar definido no .env com pelo menos 32 caracteres."
    );
  }
  return {
    password,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    },
  };
}
