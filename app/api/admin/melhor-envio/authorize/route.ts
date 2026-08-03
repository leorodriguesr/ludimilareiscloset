import { NextResponse } from "next/server";
import { UserRole } from "@/app/generated/prisma/client";
import { requireStaffApi } from "@/lib/auth/require-staff-api";
import {
  buildMelhorEnvioAuthorizeUrl,
  createMelhorEnvioOAuthState,
} from "@/lib/shipping/melhor-envio/auth";
import { readMelhorEnvioAppConfig } from "@/lib/shipping/melhor-envio/env";
import { ShippingQuoteError } from "@/lib/shipping/types";

const OAUTH_STATE_COOKIE = "me_oauth_state";
const OAUTH_STATE_MAX_AGE_SEC = 15 * 60;

export async function GET() {
  const gate = await requireStaffApi();
  if (gate instanceof NextResponse) return gate;
  if (gate.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    if (!readMelhorEnvioAppConfig()) {
      return NextResponse.json(
        {
          error:
            "Configure MELHOR_ENVIO_CLIENT_ID, MELHOR_ENVIO_CLIENT_SECRET e MELHOR_ENVIO_REDIRECT_URI.",
        },
        { status: 503 }
      );
    }
    const state = await createMelhorEnvioOAuthState();
    const url = buildMelhorEnvioAuthorizeUrl(state);
    const res = NextResponse.json({ url });
    res.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: OAUTH_STATE_MAX_AGE_SEC,
    });
    return res;
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/admin/melhor-envio/authorize]", e);
    return NextResponse.json(
      { error: "Erro ao iniciar autorização Melhor Envio." },
      { status: 500 }
    );
  }
}

export { OAUTH_STATE_COOKIE };
