export type WhatsAppPurchaseEvent = {
  ctwaClid: string;
  eventId: string;
  eventTime: Date;
  value: number;
};

export type CapiSendResult = { ok: true } | { ok: false; error: string };

type CapiConfig = {
  datasetId: string;
  accessToken: string;
  wabaId: string;
  graphVersion: string;
  testEventCode: string | null;
};

export function readCapiConfig(
  env: NodeJS.ProcessEnv = process.env
): CapiConfig | null {
  const datasetId = env.META_DATASET_ID?.trim() ?? "";
  const accessToken = env.META_CAPI_ACCESS_TOKEN?.trim() ?? "";
  const wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ?? "";
  if (!datasetId || !accessToken || !wabaId) return null;
  return {
    datasetId,
    accessToken,
    wabaId,
    graphVersion: env.META_GRAPH_API_VERSION?.trim() || "v23.0",
    testEventCode: env.META_TEST_EVENT_CODE?.trim() || null,
  };
}

export function whatsappPurchaseBody(
  event: WhatsAppPurchaseEvent,
  config: CapiConfig
): Record<string, unknown> {
  const value = Math.round(event.value * 100) / 100;
  return {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(event.eventTime.getTime() / 1000),
        event_id: event.eventId,
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: {
          whatsapp_business_account_id: config.wabaId,
          ctwa_clid: event.ctwaClid,
        },
        custom_data: {
          currency: "BRL",
          value,
        },
      },
    ],
    ...(config.testEventCode
      ? { test_event_code: config.testEventCode }
      : {}),
  };
}

export async function sendWhatsAppPurchase(
  event: WhatsAppPurchaseEvent,
  fetchImpl: typeof fetch = fetch
): Promise<CapiSendResult> {
  const config = readCapiConfig();
  if (!config) {
    return { ok: false, error: "Conversions API sem dataset, token ou WABA." };
  }
  if (!(event.value > 0)) {
    return { ok: false, error: "Valor da venda inválido para Purchase." };
  }

  const url = `https://graph.facebook.com/${config.graphVersion}/${config.datasetId}/events`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(whatsappPurchaseBody(event, config)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha de rede";
    return { ok: false, error: message.slice(0, 500) };
  }

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      error: `Meta ${response.status}: ${text.slice(0, 400)}`,
    };
  }

  try {
    const parsed = JSON.parse(text) as { events_received?: unknown };
    if (parsed.events_received !== 1) {
      return {
        ok: false,
        error: `Meta não confirmou o evento: ${text.slice(0, 400)}`,
      };
    }
  } catch {
    return { ok: false, error: "Resposta inválida da Conversions API." };
  }

  return { ok: true };
}
