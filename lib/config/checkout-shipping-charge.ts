import {
  checkFreeShipping,
  type FreeShippingSettings,
} from "@/lib/shipping/free-shipping";

/**
 * Valor cobrado no pedido/pagamento a partir da cotação escolhida.
 * Frete grátis zera só a opção mais barata, como na UI do checkout.
 */
export function resolveCheckoutShippingCharge(input: {
  quotedPrice: number;
  chosenOptionId: string;
  options: Array<{ id: string; price: number }>;
  cartSubtotal: number;
  settings: FreeShippingSettings | null | undefined;
}): number {
  const quoted = Math.round(Math.max(0, input.quotedPrice) * 100) / 100;
  if (quoted <= 0) return 0;
  if (!input.settings) return quoted;
  if (!checkFreeShipping(input.settings, input.cartSubtotal).isFree) {
    return quoted;
  }
  if (input.options.length === 0) return quoted;
  const cheapest = input.options.reduce((best, option) =>
    option.price < best.price ? option : best
  );
  return input.chosenOptionId === cheapest.id ? 0 : quoted;
}
