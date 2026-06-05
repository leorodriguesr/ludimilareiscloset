import type { CartPieceSelection } from "@/lib/cart/types";

export function describeCartPieceSelection(p: CartPieceSelection): string {
  const bits: string[] = [];
  if (p.size) bits.push(`Tam. ${p.size}`);
  if (p.color) bits.push(`Cor ${p.color}`);
  return bits.join(" · ");
}
