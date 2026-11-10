import { prisma } from "@/lib/prisma";
import { canonicalPhoneKeys } from "@/lib/meta/phone-keys";
import type { WhatsAppAdReferral } from "@/lib/meta/whatsapp-referral";

export async function recordWhatsAppAdClick(
  referral: WhatsAppAdReferral
): Promise<void> {
  const keys = canonicalPhoneKeys(referral.waId);
  if (!keys) {
    console.warn("[whatsapp click] telefone inválido", referral.waId);
    return;
  }

  try {
    await prisma.whatsAppAdClick.create({
      data: {
        phoneKey: keys.phoneKey,
        phoneKeyAlt: keys.phoneKeyAlt,
        waId: referral.waId.replace(/\D/g, ""),
        ctwaClid: referral.ctwaClid,
        sourceId: referral.sourceId,
        sourceUrl: referral.sourceUrl,
        clickedAt: referral.clickedAt,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return;
    throw error;
  }
}
