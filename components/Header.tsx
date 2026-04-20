import Link from "next/link";
import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { UserNavIcon } from "@/components/UserNavIcon";
import { CartHeaderLink } from "@/components/cart/CartHeaderLink";

export async function Header() {
  const session = await getAppSession();
  const loggedIn = Boolean(session.user);
  const accountHref = loggedIn ? "/minha-conta" : "/login?next=/minha-conta";

  let greetingName: string | null = null;
  if (session.user) {
    const row = await prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { name: true },
    });
    const full = row?.name?.trim();
    greetingName = full ? full.split(/\s+/)[0] : null;
  }

  return (
    <header className="sticky top-0 z-50 w-full min-w-0 border-b border-stone-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full min-w-0 max-w-7xl items-center justify-between gap-1.5 px-2 min-[401px]:h-16 min-[401px]:gap-2 min-[401px]:px-3 sm:px-4 md:px-6">
        <Link
          href="/"
          className="min-w-0 text-[10px] font-light uppercase leading-tight tracking-[0.06em] text-stone-900 min-[401px]:text-xs min-[401px]:tracking-[0.12em] sm:text-sm sm:tracking-[0.18em] md:text-base md:tracking-[0.24em] lg:text-lg lg:tracking-[0.3em]"
        >
          <span className="hidden min-[401px]:inline">Ludimila Reis</span>
          <span className="inline min-[401px]:hidden">
            <span className="block">Ludimila</span>
            <span className="block">Reis</span>
          </span>
        </Link>
        <nav className="flex min-w-0 shrink-0 items-center gap-1 text-[11px] text-stone-600 min-[401px]:gap-1.5 min-[401px]:text-xs sm:gap-3 sm:text-sm md:gap-6">
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap hover:text-stone-900"
          >
            Loja
          </Link>
          <span className="shrink-0">
            <CartHeaderLink />
          </span>
          {loggedIn ? (
            <Link
              href="/minha-conta"
              className="flex min-w-0 max-w-[7.5rem] items-center gap-1 rounded-full py-1 pl-0.5 pr-1.5 text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-900 min-[401px]:max-w-[11rem] min-[401px]:gap-2 min-[401px]:py-1.5 min-[401px]:pl-1 min-[401px]:pr-2 sm:max-w-[16rem] md:max-w-[18rem]"
              aria-label={
                greetingName
                  ? `Ir para minha conta — Olá, ${greetingName}`
                  : "Ir para minha conta"
              }
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-stone-700 min-[401px]:h-9 min-[401px]:w-9">
                <UserNavIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 truncate text-[11px] min-[401px]:text-sm">
                {greetingName ? (
                  <>
                    Olá,{" "}
                    <span className="font-medium text-stone-900">
                      {greetingName}
                    </span>
                  </>
                ) : (
                  <span className="font-medium text-stone-900">Olá</span>
                )}
              </span>
            </Link>
          ) : (
            <Link
              href={accountHref}
              className="shrink-0 whitespace-nowrap hover:text-stone-900"
            >
              <span className="max-[400px]:hidden">Minha conta</span>
              <span className="hidden max-[400px]:inline">Conta</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
