import { createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppAdReferral = {
  waId: string;
  ctwaClid: string;
  sourceId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  bodyText: string | null;
  clickedAt: Date;
};

export function whatsappSignatureValid(
  rawBody: string,
  header: string | null,
  secret: string
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const received = header.slice("sha256=".length).trim();
  if (!/^[0-9a-f]+$/i.test(received)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Extrai os cliques de anúncio presentes no webhook da Cloud API. */
export function parseWhatsAppAdReferrals(payload: unknown): WhatsAppAdReferral[] {
  const body = asRecord(payload);
  if (!body || body.object !== "whatsapp_business_account") return [];
  if (!Array.isArray(body.entry)) return [];

  const referrals: WhatsAppAdReferral[] = [];
  for (const entry of body.entry) {
    const entryRecord = asRecord(entry);
    if (!entryRecord || !Array.isArray(entryRecord.changes)) continue;
    for (const change of entryRecord.changes) {
      const changeRecord = asRecord(change);
      const value = asRecord(changeRecord?.value);
      if (!value || !Array.isArray(value.messages)) continue;
      for (const message of value.messages) {
        const referral = referralFromMessage(message);
        if (referral) referrals.push(referral);
      }
    }
  }
  return referrals;
}

function referralFromMessage(message: unknown): WhatsAppAdReferral | null {
  const record = asRecord(message);
  if (!record) return null;
  const referral = asRecord(record.referral);
  const ctwaClid = asString(referral?.ctwa_clid);
  const waId = asString(record.from);
  if (!ctwaClid || !waId) return null;

  const sourceType = asString(referral?.source_type);
  if (sourceType && sourceType !== "ad") return null;

  const timestamp = asString(record.timestamp);
  const seconds = timestamp ? Number(timestamp) : Number.NaN;
  const clickedAt = Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : new Date();

  return {
    waId,
    ctwaClid,
    sourceId: asString(referral?.source_id),
    sourceUrl: asString(referral?.source_url),
    headline: asString(referral?.headline),
    bodyText: asString(referral?.body),
    clickedAt,
  };
}
