"use client";

export function AdminListPagination({
  page,
  limit,
  total,
  onPageChange,
  disabled,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  if (total <= 0 || (pageCount <= 1 && page <= 1)) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-1 pt-3">
      <p className="text-xs text-stone-500">
        Mostrando {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="min-w-[5.5rem] text-center text-xs tabular-nums text-stone-600">
          Página {page} de {pageCount}
        </span>
        <button
          type="button"
          disabled={disabled || page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
