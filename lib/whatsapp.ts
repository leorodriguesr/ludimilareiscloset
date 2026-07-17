export const WHATSAPP_PHONE = "5562982181924";

export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE}`;

export function whatsappUrlWithText(text: string): string {
  return `${WHATSAPP_URL}?text=${encodeURIComponent(text)}`;
}
