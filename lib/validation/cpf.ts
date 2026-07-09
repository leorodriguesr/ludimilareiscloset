/** Remove máscara e retorna só dígitos. */
export function cpfDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Valida CPF pelo algoritmo dos dígitos verificadores (módulo 11).
 * Não consulta Receita Federal — só rejeita formato/cálculo inválido.
 */
export function isValidCpf(value: string): boolean {
  const digits = cpfDigits(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const nums = digits.split("").map((d) => Number(d));

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += nums[i]! * (10 - i);
  let rem = sum % 11;
  const d1 = rem < 2 ? 0 : 11 - rem;
  if (nums[9] !== d1) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += nums[i]! * (11 - i);
  rem = sum % 11;
  const d2 = rem < 2 ? 0 : 11 - rem;
  return nums[10] === d2;
}

export function cpfValidationError(value: string): string | null {
  const digits = cpfDigits(value);
  if (!digits) return "Informe o CPF.";
  if (digits.length !== 11) return "Informe um CPF válido (11 dígitos).";
  if (!isValidCpf(digits)) return "CPF inválido.";
  return null;
}
