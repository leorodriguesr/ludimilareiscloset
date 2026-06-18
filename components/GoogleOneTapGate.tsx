import { getAppSession } from "@/lib/auth-session";
import { GoogleOneTap } from "@/components/GoogleOneTap";

export async function GoogleOneTapGate() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return null;

  const session = await getAppSession();
  if (session.user) return null;

  return <GoogleOneTap clientId={clientId} />;
}
