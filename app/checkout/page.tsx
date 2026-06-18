import { CheckoutClient } from "@/components/checkout/CheckoutClient";
import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export default async function CheckoutPage() {
  const session = await getAppSession();
  const loggedIn = Boolean(session.user);
  let initialEmail = "";
  let initialName = "";
  let initialPhone = "";
  if (session.user) {
    const u = await prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { email: true, name: true, phone: true },
    });
    initialEmail = u?.email ?? "";
    initialName = u?.name ?? "";
    initialPhone = u?.phone ?? "";
  }

  return (
    <CheckoutClient
      initialEmail={initialEmail}
      initialName={initialName}
      initialPhone={initialPhone}
      loggedIn={loggedIn}
    />
  );
}
