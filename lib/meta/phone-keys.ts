/**
 * Chaves de telefone brasileiro para casar o `from` do WhatsApp com o
 * telefone da venda. Gera a forma com e sem o nono dígito do celular.
 */
export function brPhoneKeys(raw: string): string[] {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return [];

  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.length < 10 || digits.length > 11) return [];

  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  const keys = new Set<string>();
  keys.add(`55${ddd}${subscriber}`);

  if (subscriber.length === 9 && subscriber.startsWith("9")) {
    keys.add(`55${ddd}${subscriber.slice(1)}`);
  } else if (subscriber.length === 8 && /^[6-9]/.test(subscriber)) {
    keys.add(`55${ddd}9${subscriber}`);
  }

  return [...keys];
}

/** Forma preferida (com nono dígito, se for celular) e a alternativa. */
export function canonicalPhoneKeys(raw: string): {
  phoneKey: string;
  phoneKeyAlt: string | null;
} | null {
  const keys = brPhoneKeys(raw);
  if (keys.length === 0) return null;
  const phoneKey = keys.find((key) => key.length === 13) ?? keys[0]!;
  const phoneKeyAlt = keys.find((key) => key !== phoneKey) ?? null;
  return { phoneKey, phoneKeyAlt };
}
