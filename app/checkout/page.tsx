import { CheckoutClient } from "@/components/checkout/CheckoutClient";
import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export default async function CheckoutPage() {
  const session = await getAppSession();
  const loggedIn = Boolean(session.user);
  let initialEmail = "";
  if (session.user) {
    const u = await prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { email: true },
    });
    initialEmail = u?.email ?? "";
  }

  return (
    <CheckoutClient initialEmail={initialEmail} loggedIn={loggedIn} />
  );
}
