export const ARRANGED_DELIVERY_LABELS = {
  store_delivery: "Entregador da loja",
  pickup: "Retirada",
  uber: "Uber",
} as const;

export type ArrangedDeliveryMode = keyof typeof ARRANGED_DELIVERY_LABELS;

const LABEL_VALUES = new Set<string>(Object.values(ARRANGED_DELIVERY_LABELS));

export function arrangedDeliveryLabel(
  mode: ArrangedDeliveryMode
): string {
  return ARRANGED_DELIVERY_LABELS[mode];
}

export function arrangedDeliveryLabelFromServiceName(
  serviceName: string | null | undefined
): string | null {
  const name = serviceName?.trim();
  if (!name || name === "Entrega a combinar") return null;
  return LABEL_VALUES.has(name) ? name : name;
}

export function splitArrangedDeliveryNotes(deliveryNotes: string | null | undefined): {
  systemLabel: string | null;
  userNotes: string | null;
} {
  const trimmed = deliveryNotes?.trim();
  if (!trimmed) return { systemLabel: null, userNotes: null };

  for (const label of LABEL_VALUES) {
    if (trimmed === label) {
      return { systemLabel: label, userNotes: null };
    }
    const dashSep = `${label} — `;
    const hyphenSep = `${label} - `;
    if (trimmed.startsWith(dashSep)) {
      const userNotes = trimmed.slice(dashSep.length).trim();
      return { systemLabel: label, userNotes: userNotes || null };
    }
    if (trimmed.startsWith(hyphenSep)) {
      const userNotes = trimmed.slice(hyphenSep.length).trim();
      return { systemLabel: label, userNotes: userNotes || null };
    }
  }

  return { systemLabel: null, userNotes: trimmed };
}

/**
 * Recompõe `deliveryNotes` ao editar só a parte do usuário.
 * Preserva prefixo legado ("Uber — …") quando o tipo não está em `shippingServiceName`.
 */
export function composeDeliveryNotesFromUserEdit(
  previousDeliveryNotes: string | null | undefined,
  shippingServiceName: string | null | undefined,
  userNotes: string
): string | null {
  const trimmed = userNotes.trim();
  const split = splitArrangedDeliveryNotes(previousDeliveryNotes);
  const fromService = arrangedDeliveryLabelFromServiceName(shippingServiceName);
  if (split.systemLabel && !fromService) {
    return trimmed ? `${split.systemLabel} — ${trimmed}` : split.systemLabel;
  }
  return trimmed || null;
}

/** Texto de observação de entrega (sem rótulo de modalidade a combinar). */
export function orderDeliveryUserNotes(input: {
  fulfillmentType?: string | null;
  shippingServiceName?: string | null;
  deliveryNotes?: string | null;
  shippingAmount?: number | null;
}): string | null {
  if (input.fulfillmentType === "ARRANGED") {
    return (
      resolveArrangedDeliveryDisplay({
        shippingServiceName: input.shippingServiceName,
        deliveryNotes: input.deliveryNotes,
        shippingAmount: input.shippingAmount ?? 0,
      }).userNotes ?? null
    );
  }
  const trimmed = input.deliveryNotes?.trim();
  return trimmed || null;
}

export function resolveArrangedDeliveryDisplay(input: {
  shippingServiceName?: string | null;
  deliveryNotes?: string | null;
  shippingAmount: number;
}): {
  typeLabel: string;
  showPrice: boolean;
  userNotes: string | null;
} {
  const fromService = arrangedDeliveryLabelFromServiceName(input.shippingServiceName);
  const fromNotes = splitArrangedDeliveryNotes(input.deliveryNotes);

  const typeLabel =
    fromService ?? fromNotes.systemLabel ?? "Entrega a combinar";

  let userNotes: string | null = null;
  if (fromService) {
    userNotes = fromNotes.userNotes;
  } else if (fromNotes.systemLabel) {
    userNotes = fromNotes.userNotes;
  } else {
    userNotes = fromNotes.userNotes;
  }

  return {
    typeLabel,
    // Entregador da loja ficou a combinar (como Uber); só mostra preço se houver valor legado.
    showPrice:
      typeLabel === ARRANGED_DELIVERY_LABELS.store_delivery &&
      input.shippingAmount > 0,
    userNotes,
  };
}

export type ShippingFeeDisplay =
  | { kind: "to_arrange" }
  | { kind: "free" }
  | { kind: "priced"; amount: number };

/** Rótulo de frete para cliente/admin: Entregador da loja e Uber → A combinar. */
export function resolveShippingFeeDisplay(input: {
  shippingServiceName?: string | null;
  deliveryNotes?: string | null;
  shippingAmount: number;
}): ShippingFeeDisplay {
  const { typeLabel } = resolveArrangedDeliveryDisplay(input);
  if (
    typeLabel === ARRANGED_DELIVERY_LABELS.store_delivery ||
    typeLabel === ARRANGED_DELIVERY_LABELS.uber
  ) {
    return { kind: "to_arrange" };
  }
  if (input.shippingAmount > 0) {
    return { kind: "priced", amount: input.shippingAmount };
  }
  return { kind: "free" };
}

export function shippingFeeDisplayText(
  display: ShippingFeeDisplay,
  formatPrice: (amount: number) => string
): string {
  if (display.kind === "to_arrange") return "A combinar";
  if (display.kind === "free") return "Grátis";
  return formatPrice(display.amount);
}
