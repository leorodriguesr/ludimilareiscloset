import { Cormorant_Garamond } from "next/font/google";
import { whatsappUrlWithText } from "@/lib/whatsapp";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const SELLER_ASSIST_MESSAGE =
  "Olá! Não encontrei meu look no site e gostaria de ajuda.";

const ACCENT = "#B5838D";
const BG = "#FDF5F2";
const ICON_BG = "#F3E4DF";

function ShoppingBagIcon() {
  return (
    <svg
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 10V7a4 4 0 1 0-8 0v3"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.5 9.5h13l-.9 10.2a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3L5.5 9.5Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12.05 16.9c-.7-.65-2.05-1.55-2.05-2.75 0-.75.55-1.25 1.2-1.25.4 0 .75.2.95.5.2-.3.55-.5.95-.5.65 0 1.2.5 1.2 1.25 0 1.2-1.35 2.1-2.25 2.75Z"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      className="h-10 w-10"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 0c.2 2.8 1.2 4.8 4 5-2.8.2-3.8 2.2-4 5-.2-2.8-1.2-4.8-4-5 2.8-.2 3.8-2.2 4-5Z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function LeafFlourish() {
  return (
    <svg
      className="pointer-events-none absolute bottom-0 right-0 h-28 w-32 opacity-40 sm:h-32 sm:w-40"
      viewBox="0 0 140 110"
      fill="none"
      stroke={ACCENT}
      strokeWidth={1.1}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M118 98c-18-8-34-28-38-52 14 6 28 22 38 52Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M80 96c-14-18-18-40-12-58 10 10 18 30 12 58Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M98 100c-8-22-6-44 6-62 2 18-2 40-6 62Z"
      />
      <path strokeLinecap="round" d="M90 42c8-10 22-16 34-18" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M124 24c-4 8-4 14 0 22 6-4 10-12 8-20-2-4-6-4-8-2Z"
      />
    </svg>
  );
}

export function SellerAssistBanner() {
  const href = whatsappUrlWithText(SELLER_ASSIST_MESSAGE);

  return (
    <aside
      className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 overflow-hidden"
      style={{ backgroundColor: BG }}
    >
      <LeafFlourish />

      <div className="relative mx-auto flex min-h-[9.5rem] w-full max-w-5xl flex-col items-center justify-center gap-5 px-5 py-10 text-center sm:min-h-[11rem] sm:gap-6 sm:px-8 sm:py-12 lg:min-h-[12rem] lg:flex-row lg:gap-10 lg:text-left">
        <div className="flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5 lg:flex-1 lg:justify-center">
          <div className="relative shrink-0">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full text-stone-700 sm:h-14 sm:w-14"
              style={{ backgroundColor: ICON_BG, color: "#3f3f46" }}
            >
              <ShoppingBagIcon />
            </span>
            <span
              className="absolute left-8 -top-4"
              style={{ color: ACCENT }}
            >
              <SparkleIcon  />
            </span>
          </div>

          <div className="min-w-0 max-w-md sm:max-w-lg sm:text-left">
            <h2
              className={`${display.className} text-[1.75rem] leading-tight tracking-tight text-stone-800 sm:text-[2.1rem]`}
            >
              Não encontrou{" "}
              <em className="font-normal italic" style={{ color: ACCENT }}>
                seu look?
              </em>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600 sm:text-[15px]">
              Chame nossa vendedora e monte a{" "}
              <span className="font-semibold text-stone-800">peça perfeita</span>{" "}
              para você.
            </p>
          </div>
        </div>

        <div className="hidden h-14 w-px shrink-0 bg-stone-300/80 lg:block" aria-hidden />

        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative z-10 inline-flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <span style={{ color: ACCENT }}>
            <WhatsAppIcon />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-800 sm:text-xs">
            Falar no WhatsApp
          </span>
          <svg
            className="h-4 w-4 text-stone-700 transition-transform group-hover:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
            />
          </svg>
        </a>
      </div>
    </aside>
  );
}
