"use client";

export function AdminModal({
  title,
  subtitle,
  onClose,
  children,
  banner,
  aside,
  footer,
  wide,
  xl,
  bannerInMain,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  banner?: React.ReactNode;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  xl?: boolean;
  bannerInMain?: boolean;
}) {
  const size = xl
    ? "md:h-[min(48rem,calc(100dvh-2rem))] md:max-h-[min(48rem,calc(100dvh-2rem))] md:max-w-6xl"
    : wide
      ? "md:h-[min(40rem,calc(100dvh-2rem))] md:max-h-[min(40rem,calc(100dvh-2rem))] md:max-w-3xl"
      : "md:h-[min(40rem,calc(100dvh-2rem))] md:max-h-[min(40rem,calc(100dvh-2rem))] md:max-w-lg";
  return (
    <div className="fixed inset-0 z-[70] flex bg-stone-900/50 backdrop-blur-sm">
      <div
        className={`flex h-[100dvh] w-full flex-col overflow-hidden bg-white md:m-auto md:w-full md:rounded-2xl md:border md:border-stone-200 md:shadow-2xl ${size}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-4 py-3 sm:px-5">
          <div className="min-w-0 pr-3">
            <h2 className="truncate text-base font-semibold text-stone-900">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-stone-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {banner && !bannerInMain ? (
          <div className="shrink-0 border-b border-stone-100 bg-stone-50/80 px-4 py-3 sm:px-5">
            {banner}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {banner && bannerInMain ? (
              <div className="shrink-0 border-b border-stone-100 bg-stone-50/80 px-4 py-3 sm:px-5">
                {banner}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {children}
            </div>
          </div>
          {aside ? (
            <div className="max-h-[42vh] shrink-0 overflow-y-auto border-t border-stone-100 bg-stone-50/80 px-4 py-3 md:max-h-none md:w-72 md:border-l md:border-t-0 md:bg-stone-50/60 lg:w-80 sm:px-5">
              {aside}
            </div>
          ) : null}
        </div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-stone-100 px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
