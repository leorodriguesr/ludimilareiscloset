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

export function resolveArrangedDeliveryDisplay(input: {
  shippingServiceName: string | null | undefined;
  deliveryNotes: string | null | undefined;
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
    showPrice: typeLabel === ARRANGED_DELIVERY_LABELS.store_delivery,
    userNotes,
  };
}
