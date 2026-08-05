type OrderNotesHintProps = {
  notes: string;
  title: string;
  ariaLabel: string;
  tone: "violet" | "sky";
  icon: "doc" | "truck";
};

export function OrderNotesHint({
  notes,
  title,
  ariaLabel,
  tone,
  icon,
}: OrderNotesHintProps) {
  const toneClass =
    tone === "violet"
      ? "text-violet-500 hover:bg-violet-50 hover:text-violet-700"
      : "text-sky-500 hover:bg-sky-50 hover:text-sky-700";

  return (
    <span className="relative inline-flex group/notes">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${toneClass}`}
        aria-label={ariaLabel}
      >
        {icon === "doc" ? (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        ) : (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.129a2.25 2.25 0 0 0-2.25-2.25H5.043A2.25 2.25 0 0 0 2.25 7.5v7.844c0 .192.027.384.077.57l.56 1.682a1.875 1.875 0 0 0 1.785 1.279h1.328M16.5 18.75h.008v.008H16.5v-.008Zm0 0h.008v.008H16.5v-.008Z"
            />
          </svg>
        )}
      </span>
      <span className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 hidden w-64 rounded-lg border border-stone-200 bg-white p-3 text-xs leading-relaxed text-stone-600 shadow-lg group-hover/notes:block">
        <span className="mb-1 block font-medium text-stone-800">{title}</span>
        {notes}
      </span>
    </span>
  );
}
