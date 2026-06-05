/** Valor de cada parcela em N vezes sem juros (arredondado em centavos). */
export function installmentValueEqualParts(
  listPrice: number,
  parts: number
): number {
  if (parts <= 0) return listPrice;
  return Math.round((listPrice / parts) * 100) / 100;
}
