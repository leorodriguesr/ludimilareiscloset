export function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-50">
      <div className="mx-auto w-full min-w-0 max-w-7xl px-2 py-12 min-[401px]:px-3 sm:px-4 md:px-6">
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-sm font-light uppercase tracking-[0.12em] text-stone-900 min-[401px]:text-base min-[401px]:tracking-[0.2em] sm:text-lg sm:tracking-[0.3em]">
            Ludimila Reis
          </p>
          <p className="text-xs text-stone-500">
            &copy; {new Date().getFullYear()} Ludimila Reis Closet. Todos os
            direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
