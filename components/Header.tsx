import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { HeaderClient } from "@/components/HeaderClient";

export async function Header() {
  const session = await getAppSession();
  const loggedIn = Boolean(session.user);
  const accountHref = loggedIn ? "/minha-conta" : "/login?next=/minha-conta";

  let greetingName: string | null = null;
  let avatarUrl: string | null = null;
  if (session.user) {
    const row = await prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { name: true, picture: true },
    });
    const full = row?.name?.trim();
    greetingName = full ? full.split(/\s+/)[0] : null;
    avatarUrl = row?.picture ?? null;
  }

  return (
    <header className="sticky top-0 z-50 w-full min-w-0 border-b border-stone-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full min-w-0 max-w-7xl items-center px-4 sm:h-16 sm:px-6 md:px-8">
        <HeaderClient
          loggedIn={loggedIn}
          accountHref={accountHref}
          greetingName={greetingName}
          avatarUrl={avatarUrl}
        />
      </div>
    </header>
  );
}
