import Link from "next/link";

function PixIcon() {
  return (
    <svg viewBox="0 0 512 512" className="h-7 w-7 fill-current" aria-label="Pix">
      <path d="M242.4 292.5C247.8 297.9 254.3 300.6 261 300.6C267.8 300.6 274.2 297.9 279.7 292.5L358.8 213.3C372.9 199.2 391.2 191.4 410.7 191.4C430.2 191.4 448.5 199.2 462.6 213.3L510.1 260.8C511.7 262.4 512 264.5 511.4 266.4C510.9 268.4 509.4 269.9 507.5 270.5L462.6 284.7C443.1 290.1 425.9 301.3 413.1 316.7L294.5 455.7C287.8 463.5 278.6 467.8 269.1 467.8H253.3C243.8 467.8 234.6 463.5 227.9 455.7L109.2 316.7C96.43 301.3 79.2 290.1 59.7 284.7L14.5 270.5C12.6 269.9 11.1 268.4 10.5 266.4C9.9 264.5 10.2 262.4 11.8 260.8L59.4 213.3C73.4 199.2 91.7 191.4 111.2 191.4C130.7 191.4 149 199.2 163.1 213.3L242.4 292.5ZM261 276.5C258 276.5 255.4 275.3 253.4 273.2L174.1 194C164.4 184.3 151.7 178.8 138.2 178.8H84.1L242.6 358.6C247.8 364.7 252.4 368.1 257.2 368.1C261.8 368.1 266.5 364.7 271.7 358.6L430.2 178.8H376C362.5 178.8 349.8 184.3 340.1 194L260.9 273.2C259.1 275.3 256.5 276.5 253.4 276.5C253.4 276.5 261 276.5 261 276.5ZM110.9 178.8C91.5 178.8 73.3 186.5 59.4 200.4L23.4 236.4L57.2 247.7C78.9 254.5 98.4 267.3 113.4 284.9L219.5 407.5C227.1 416.2 237.1 421.1 247.8 421.2C243.1 421.2 239.2 419.4 236.3 416.1L117.7 277.2C104.9 261.7 87.7 250.5 68.3 245.2L12.1 227.8L59.7 180.2C73.4 166.5 91.6 178.8 110.9 178.8ZM403.4 178.8C422.8 178.8 440.9 186.5 454.9 200.4L500.3 245.8L458.1 258.2C437.6 264.2 419.4 276 405.9 292.3L299.8 407.5C292.2 416.2 282.2 421.1 271.6 421.2C276.3 421.2 280.2 419.4 283.1 416.1L401.8 277.2C414.5 261.7 431.7 250.5 451.1 245.2L510.1 227.6L462.6 180.2C449.4 166.5 430.8 178.8 411.5 178.8H403.4Z"/>
    </svg>
  );
}

function VisaIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-7 w-11 fill-current" aria-label="Visa">
      <rect width="48" height="48" rx="6" className="fill-stone-700"/>
      <path d="M19.5 30H16.3L18.4 18H21.6L19.5 30ZM14.2 18L11.2 26.1L10.8 24.1L9.7 19.1C9.5 18.4 9 18 8.3 18H3L3 18.3C4.7 18.7 6.2 19.4 7.5 20.3L10.4 30H13.8L19.1 18H14.2ZM43 30H46L43.4 18H40.7C40.1 18 39.6 18.3 39.4 18.8L34.5 30H37.9L38.6 28H42.7L43 30ZM39.5 25.5L41.2 20.9L42.1 25.5H39.5ZM31.9 21.1C33 21.1 34.1 21.3 35 21.8L35.4 18.8C34.5 18.4 33.3 18 31.9 18C28.8 18 26.6 19.7 26.6 22.1C26.6 23.9 28.1 24.9 29.2 25.5C30.4 26.1 30.8 26.5 30.8 27.1C30.8 28 29.7 28.4 28.7 28.4C27.4 28.4 26.3 28.1 25.5 27.7L25.1 30.8C26 31.2 27.4 31.5 28.8 31.5C32.1 31.5 34.3 29.8 34.3 27.2C34.3 24.1 30.1 23.9 30.1 22.7C30.1 21.8 31 21.1 31.9 21.1Z" fill="white"/>
    </svg>
  );
}

function MastercardIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-7 w-11" aria-label="Mastercard">
      <rect width="48" height="48" rx="6" fill="#1A1F36"/>
      <circle cx="19" cy="24" r="9" fill="#EB001B"/>
      <circle cx="29" cy="24" r="9" fill="#F79E1B"/>
      <path d="M24 17.4A9 9 0 0 1 29 24a9 9 0 0 1-5 6.6A9 9 0 0 1 19 24a9 9 0 0 1 5-6.6Z" fill="#FF5F00"/>
    </svg>
  );
}

function EloIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-7 w-11" aria-label="Elo">
      <rect width="48" height="48" rx="6" fill="#FFF100"/>
      <text x="7" y="30" fontSize="15" fontWeight="bold" fill="#000" fontFamily="Arial">elo</text>
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="bg-stone-900 text-stone-300">
      <div className="mx-auto w-full max-w-7xl px-2 pt-14 pb-8 min-[401px]:px-3 sm:px-4 md:px-6">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">

          {/* Marca */}
          <div className="lg:col-span-1">
            <p className="text-lg font-extralight uppercase tracking-[0.25em] text-white">
              Ludimila Reis
            </p>
            <p className="mt-3 text-sm leading-relaxed text-stone-400">
              Moda feminina com estilo, elegância e personalidade. Peças
              selecionadas com carinho para você se sentir poderosa todos
              os dias.
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-700 text-stone-400 transition-colors hover:border-stone-400 hover:text-white"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069Zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
                </svg>
              </a>
              <a
                href="https://wa.me/5500000000000"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-700 text-stone-400 transition-colors hover:border-stone-400 hover:text-white"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Navegação */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white">
              Navegação
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/" className="transition-colors hover:text-white">
                  Loja
                </Link>
              </li>
              <li>
                <Link href="/login?next=/minha-conta" className="transition-colors hover:text-white">
                  Minha conta
                </Link>
              </li>
              <li>
                <Link href="/cart" className="transition-colors hover:text-white">
                  Carrinho
                </Link>
              </li>
            </ul>
          </div>

          {/* Atendimento */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white">
              Atendimento
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2 text-stone-400">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <span>Seg – Sex: 9h às 18h<br />Sáb: 9h às 13h</span>
              </li>
              <li>
                <a
                  href="https://wa.me/5500000000000"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 transition-colors hover:text-white"
                >
                  <svg className="h-4 w-4 shrink-0 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                  </svg>
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>

          {/* Pagamentos */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white">
              Formas de pagamento
            </h3>
            <div className="flex flex-wrap gap-2">
              <span className="text-stone-400"><PixIcon /></span>
              <VisaIcon />
              <MastercardIcon />
              <EloIcon />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-stone-500">
              Pagamentos processados com segurança.
              Seus dados nunca são compartilhados.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 border-t border-stone-800 pt-8 sm:flex-row sm:justify-between">
          <p className="text-xs text-stone-500">
            &copy; {new Date().getFullYear()} Ludimila Reis Closet. Todos os direitos reservados.
          </p>
          <p className="text-xs text-stone-600">
            Desenvolvido com ♥ no Brasil
          </p>
        </div>
      </div>
    </footer>
  );
}
