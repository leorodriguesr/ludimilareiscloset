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

export type CustomerNamePhoneFields = {
  name: string;
  phone: string;
};

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Nome + telefone — entrega a combinar (loja, retirada, Uber). */
export function isCustomerNamePhoneComplete(
  data: CustomerNamePhoneFields
): boolean {
  if (!data.name.trim()) return false;
  if (digits(data.phone).length < 10) return false;
  return true;
}

export function customerNamePhoneValidationError(
  data: CustomerNamePhoneFields
): string | null {
  if (isCustomerNamePhoneComplete(data)) return null;
  return "Informe o nome e o telefone do cliente.";
}

/** Todos os campos de contato e endereço preenchidos (transportadora). */
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
