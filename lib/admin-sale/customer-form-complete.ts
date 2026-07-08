export type CustomerContactAddressFields = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  destinationCep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Todos os campos de contato e endereço preenchidos (venda avulsa). */
export function isCustomerContactAddressComplete(
  data: CustomerContactAddressFields
): boolean {
  const email = data.email.trim();
  if (!data.name.trim()) return false;
  if (!email || !email.includes("@") || !email.includes(".")) return false;
  if (digits(data.phone).length < 10) return false;
  if (digits(data.cpf).length !== 11) return false;
  if (digits(data.destinationCep).length !== 8) return false;
  if (!data.street.trim()) return false;
  if (!data.number.trim()) return false;
  if (!data.neighborhood.trim()) return false;
  if (!data.city.trim()) return false;
  if (data.state.trim().length !== 2) return false;
  return true;
}

export function customerContactAddressValidationError(
  data: CustomerContactAddressFields
): string | null {
  if (isCustomerContactAddressComplete(data)) return null;
  return "Preencha todos os dados de contato e endereço.";
}
