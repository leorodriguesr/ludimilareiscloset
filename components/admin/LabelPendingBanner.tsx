/** Indica se a geração automática de etiqueta falhou após o pagamento. */
export function hasLabelAutoGenerateError(order: {
  paidAt: string | null;
  labelUrl: string | null;
  status: string;
  labelAutoGenerateError?: string | null;
}): boolean {
  if (!order.paidAt || order.labelUrl || order.status === "cancelled") return false;
  return Boolean(order.labelAutoGenerateError?.trim());
}

export function labelAutoGenerateErrorTooltip(order: {
  labelAutoGenerateError?: string | null;
}): string {
  return (
    order.labelAutoGenerateError?.trim() ||
    "Etiqueta pendente — verifique saldo SuperFrete"
  );
}

export function LabelAutoGenerateWarningIcon({ title }: { title: string }) {
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-amber-600"
      title={title}
      aria-label={title}
      role="img"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
    </span>
  );
}
