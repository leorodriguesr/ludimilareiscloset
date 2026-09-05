import {
  CustomerDataStatus,
  FulfillmentType,
  OrderSource,
  PaymentChannel,
} from "@/app/generated/prisma/client";
import {
  arrangedDeliveryLabel,
  type ArrangedDeliveryMode,
} from "@/lib/admin-sale/arranged-delivery";
import type { CartPieceSelection } from "@/lib/cart/types";
import {
  resolveAdminSalePricing,
  type AdminSaleLineInput,
  type DiscountInput,
} from "@/lib/admin-sale/pricing";
import {
  buildCustomerDataUrl,
  generateCustomerDataToken,
} from "@/lib/admin-sale/complete-customer-data";
import { ensureOrderPaymentToken } from "@/lib/admin-sale/payment-page";
import {
  ADDRESS_COMPLEMENT_MAX_LENGTH,
  ADDRESS_NUMBER_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  customerContactAddressValidationError,
  customerNamePhoneValidationError,
} from "@/lib/admin-sale/customer-form-complete";
import { getFulfillmentStrategy } from "@/lib/fulfillment/fulfillment-types";
import { initiateOrderPayment } from "@/lib/order/payment/initiate-payment";
import {
  ORDER_CHARGE_REASON,
  ORDER_CHARGE_STATUS,
  ORDER_ITEM_PAYMENT_STATUS,
  ORDER_PENDING_TTL_MS,
  ORDER_STATUS,
  type PaymentMethod,
} from "@/lib/orders/constants";
import { reserveStockForOrderLines } from "@/lib/orders/stock/reservation";
import { deliveredAtOnStatusChange } from "@/lib/orders/delivered-at";
import { prisma } from "@/lib/prisma";
import { checkFreeShipping } from "@/lib/shipping/free-shipping";
import {
  quoteShippingForCartLines,
  quoteShippingForDefaultPackage,
} from "@/lib/shipping/quote-cart";
import {
  resolveShippingProviderFromQuote,
} from "@/lib/shipping/providers";
import {
  parseSuperfreteServiceId,
} from "@/lib/shipping/service-id";
import { normalizePostalCode } from "@/lib/shipping/superfrete";

export type AdminSaleContactInput = {
  name: string;
  email?: string;
  phone: string;
  cpf?: string;
};

export type AdminSaleAddressInput = {
  destinationCep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
};

export type CreateAdminSaleInput = {
  lines: AdminSaleLineInput[];
  fulfillmentType: FulfillmentType;
  /** Transportadora: CEP + optionId da cotação. */
  carrierShipping?: { destinationCep: string; optionId: string };
  /** Entrega a combinar: valor informado pelo staff. */
  arrangedShippingAmount?: number;
  arrangedMode?: ArrangedDeliveryMode;
  deliveryNotes?: string;
  internalNotes?: string;
  customerData: "now" | "later";
  contact?: AdminSaleContactInput;
  address?: AdminSaleAddressInput;
  paymentAlreadyPaid: boolean;
  paymentMethod: PaymentMethod;
  orderDiscount?: DiscountInput;
  createdByUserId: string;
};

export type CreateAdminSaleResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: number;
      total: number;
      customerDataUrl?: string;
      payment?: {
        type: "pix";
        paymentUrl: string;
        paymentPath: string;
        pixCode: string;
        pixQrBase64: string | null;
        amount: number;
      } | {
        type: "card";
        checkoutUrl: string;
      };
    }
  | { ok: false; error: string };

function serializePieceSelections(
  selections?: CartPieceSelection[]
): string | null {
  if (!selections?.length) return null;
  return JSON.stringify(selections);
}

async function loadFreeShippingSettings() {
  const settings = await prisma.storeSettings.findUnique({
    where: { id: "default" },
    select: {
      freeShippingEnabled: true,
      freeShippingType: true,
      freeShippingMinValue: true,
    },
  });
  return {
    freeShippingEnabled: settings?.freeShippingEnabled ?? false,
    freeShippingType: settings?.freeShippingType ?? "minimum_value",
    freeShippingMinValue: settings?.freeShippingMinValue ?? 0,
  };
}

async function rollbackAdminSaleAfterPaymentFailure(
  orderId: string
): Promise<boolean> {
  try {
    const deleted = await prisma.order.deleteMany({
      where: {
        id: orderId,
        orderSource: OrderSource.ADMIN_SALE,
        status: ORDER_STATUS.PENDING_PAYMENT,
        paidAt: null,
      },
    });
    return deleted.count > 0;
  } catch (error) {
    console.error(
      "[createAdminSale] falha ao remover venda sem cobrança",
      orderId,
      error
    );
    return false;
  }
}

async function resolveShipping(input: CreateAdminSaleInput) {
  const strategy = getFulfillmentStrategy(input.fulfillmentType);

  if (input.fulfillmentType === FulfillmentType.CARRIER) {
    if (!input.carrierShipping) {
      throw new Error("Informe o CEP e a opção de frete.");
    }
    const destCep = normalizePostalCode(input.carrierShipping.destinationCep);
    if (!destCep) throw new Error("CEP de entrega inválido.");

    const catalogLines = input.lines
      .filter((l): l is Extract<AdminSaleLineInput, { kind: "catalog" }> =>
        l.kind === "catalog"
      )
      .map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
      }));

    const customLines = input.lines.filter(
      (l): l is Extract<AdminSaleLineInput, { kind: "custom" }> =>
        l.kind === "custom"
    );

    const quote =
      catalogLines.length > 0
        ? await quoteShippingForCartLines(catalogLines, destCep)
        : await quoteShippingForDefaultPackage(destCep, {
            quantity: customLines.reduce((sum, l) => sum + l.quantity, 0) || 1,
            insuranceValue: customLines.reduce(
              (sum, l) => sum + Math.max(0, l.unitPrice) * l.quantity,
              0
            ),
          });
    const chosen = quote.options.find(
      (o) => o.id === input.carrierShipping!.optionId
    );
    if (!chosen) {
      throw new Error("Opção de frete inválida ou expirada.");
    }

    const quotedPrice = Math.round(chosen.price * 100) / 100;
    const cheapest = [...quote.options].sort((a, b) => a.price - b.price)[0];
    const isCheapestOption = cheapest?.id === chosen.id;
    const shippingProvider = resolveShippingProviderFromQuote({
      optionId: input.carrierShipping.optionId,
      quoteProvider: quote.provider,
    });
    const shippingQuotePackagesJson = Array.isArray(chosen.packages)
      ? JSON.stringify(chosen.packages)
      : null;

    return {
      shippingAmount: quotedPrice,
      isCheapestCarrierOption: isCheapestOption,
      destinationCep: destCep,
      shippingQuotedPrice: quotedPrice,
      shippingDeliveryDaysMin:
        chosen.deliveryDaysMin > 0 ? Math.floor(chosen.deliveryDaysMin) : null,
      shippingDeliveryDaysMax:
        chosen.deliveryDaysMax > 0 ? Math.floor(chosen.deliveryDaysMax) : null,
      shippingServiceName: `${chosen.carrierName} — ${chosen.serviceName}`,
      shippingServiceId:
        chosen.serviceId ??
        parseSuperfreteServiceId(input.carrierShipping.optionId),
      shippingProvider,
      shippingQuotePackagesJson,
      packageHeightCm: quote.idealPackage?.heightCm ?? null,
      packageWidthCm: quote.idealPackage?.widthCm ?? null,
      packageLengthCm: quote.idealPackage?.lengthCm ?? null,
      packageWeightKg: quote.idealPackage?.weightKg ?? null,
      deliveryNotes: input.deliveryNotes?.trim() || null,
    };
  }

  // Entregador da loja / Uber: frete a combinar (não soma no pedido).
  const arrangedAmount = Math.max(0, Number(input.arrangedShippingAmount ?? 0));
  if (!Number.isFinite(arrangedAmount)) {
    throw new Error("Valor da entrega inválido.");
  }

  const arrangedServiceName = input.arrangedMode
    ? arrangedDeliveryLabel(input.arrangedMode)
    : strategy.defaultShippingServiceName;

  return {
    shippingAmount: Math.round(arrangedAmount * 100) / 100,
    isCheapestCarrierOption: false,
    destinationCep: input.address
      ? normalizePostalCode(input.address.destinationCep)
      : null,
    shippingQuotedPrice: null,
    shippingDeliveryDaysMin: null,
    shippingDeliveryDaysMax: null,
    shippingServiceName: arrangedServiceName,
    shippingServiceId: null,
    shippingProvider: null,
    shippingQuotePackagesJson: null,
    packageHeightCm: null,
    packageWidthCm: null,
    packageLengthCm: null,
    packageWeightKg: null,
    deliveryNotes: input.deliveryNotes?.trim() || null,
  };
}

export async function createAdminSale(
  input: CreateAdminSaleInput
): Promise<CreateAdminSaleResult> {
  if (!input.lines.length) {
    return { ok: false, error: "Adicione ao menos um produto." };
  }

  let shipping;
  try {
    shipping = await resolveShipping(input);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao calcular entrega.",
    };
  }

  let merchandiseSubtotal: number;
  try {
    const basePricing = await resolveAdminSalePricing({
      lines: input.lines,
      paymentMethod: input.paymentMethod,
      shippingAmount: 0,
      orderDiscount: input.orderDiscount,
    });
    merchandiseSubtotal = basePricing.subtotalAfterItemDiscounts;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao calcular totais.",
    };
  }

  const freeShippingSettings = await loadFreeShippingSettings();
  const qualifiesForFreeShipping = checkFreeShipping(
    freeShippingSettings,
    merchandiseSubtotal
  ).isFree;

  let chargedShippingAmount = shipping.shippingAmount;
  if (
    qualifiesForFreeShipping &&
    input.fulfillmentType === FulfillmentType.CARRIER &&
    shipping.isCheapestCarrierOption
  ) {
    chargedShippingAmount = 0;
  }

  let pricing;
  try {
    pricing = await resolveAdminSalePricing({
      lines: input.lines,
      paymentMethod: input.paymentMethod,
      shippingAmount: chargedShippingAmount,
      orderDiscount: input.orderDiscount,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao calcular totais.",
    };
  }

  const isArranged = input.fulfillmentType === FulfillmentType.ARRANGED;
  // Entrega a combinar exige nome/telefone na criação — sem link "depois".
  const fillNow = isArranged || input.customerData === "now";

  if (isArranged && input.customerData === "later") {
    return {
      ok: false,
      error: "Na entrega a combinar, informe nome e telefone do cliente agora.",
    };
  }

  // Nome + telefone sempre obrigatórios (também em "adicionar depois").
  const namePhoneError = customerNamePhoneValidationError({
    name: input.contact?.name ?? "",
    phone: input.contact?.phone ?? "",
  });
  if (namePhoneError) {
    return { ok: false, error: namePhoneError };
  }

  if (fillNow && !isArranged) {
    const contactFields = {
      name: input.contact?.name ?? "",
      email: input.contact?.email ?? "",
      phone: input.contact?.phone ?? "",
      cpf: input.contact?.cpf ?? "",
      destinationCep: input.address?.destinationCep ?? "",
      street: input.address?.street ?? "",
      number: input.address?.number ?? "",
      complement: input.address?.complement ?? "",
      neighborhood: input.address?.neighborhood ?? "",
      city: input.address?.city ?? "",
      state: input.address?.state ?? "",
    };
    const validationError = customerContactAddressValidationError(contactFields);
    if (validationError) {
      return { ok: false, error: validationError };
    }
  }

  const tokenData = fillNow ? null : generateCustomerDataToken();
  const contactEmail = input.contact?.email?.trim().toLowerCase() || null;
  // E-mail só é gravado quando informado; sem placeholder em "preencher depois" / entrega a combinar.
  const orderEmail = contactEmail;

  const created = await prisma.$transaction(async (tx) => {
    const maxRow = await tx.$queryRawUnsafe<Array<{ max: number | null }>>(
      `SELECT MAX("orderNumber") as max FROM "Order"`
    );
    const nextOrderNumber = (maxRow[0]?.max ?? 0) + 1;

    const order = await tx.order.create({
      data: {
        orderNumber: nextOrderNumber,
        email: orderEmail,
        status: input.paymentAlreadyPaid
          ? ORDER_STATUS.PAID
          : ORDER_STATUS.PENDING_PAYMENT,
        orderSource: OrderSource.ADMIN_SALE,
        createdByUserId: input.createdByUserId,
        fulfillmentType: input.fulfillmentType,
        customerDataStatus: fillNow
          ? CustomerDataStatus.COMPLETE
          : CustomerDataStatus.PENDING,
        customerDataToken: tokenData?.token ?? null,
        customerDataTokenExpiresAt: tokenData?.expiresAt ?? null,
        paymentChannel: input.paymentAlreadyPaid
          ? PaymentChannel.MANUAL
          : null,
        paymentMethod: input.paymentMethod,
        paidAt: input.paymentAlreadyPaid ? new Date() : null,
        manualPaidByUserId: input.paymentAlreadyPaid
          ? input.createdByUserId
          : null,
        deliveryNotes: shipping.deliveryNotes,
        internalNotes: input.internalNotes?.trim() || null,
        subtotalOriginal: pricing.subtotalOriginal,
        itemsDiscountTotal: pricing.itemsDiscountTotal,
        orderDiscountMode: input.orderDiscount?.mode ?? null,
        orderDiscountValue: input.orderDiscount?.value ?? null,
        orderDiscountAmount: pricing.orderDiscountAmount,
        total: pricing.total,
        paidTotal: input.paymentAlreadyPaid ? pricing.total : 0,
        shippingAmount: pricing.shippingAmount,
        shippingQuotedPrice: shipping.shippingQuotedPrice,
        shippingDeliveryDaysMin: shipping.shippingDeliveryDaysMin,
        shippingDeliveryDaysMax: shipping.shippingDeliveryDaysMax,
        shippingServiceName: shipping.shippingServiceName,
        shippingServiceId: shipping.shippingServiceId,
        shippingProvider: shipping.shippingProvider,
        shippingQuotePackagesJson: shipping.shippingQuotePackagesJson,
        destinationCep:
          shipping.destinationCep ??
          (fillNow && !isArranged && input.address
            ? normalizePostalCode(input.address.destinationCep)
            : null),
        packageHeightCm: shipping.packageHeightCm,
        packageWidthCm: shipping.packageWidthCm,
        packageLengthCm: shipping.packageLengthCm,
        packageWeightKg: shipping.packageWeightKg,
        recipientName: input.contact!.name
          .trim()
          .slice(0, CUSTOMER_NAME_MAX_LENGTH),
        phone: input.contact!.phone.trim(),
        cpf: fillNow && !isArranged ? input.contact!.cpf?.trim() || null : null,
        addressStreet:
          fillNow && !isArranged ? input.address?.street.trim() || null : null,
        addressNumber:
          fillNow && !isArranged
            ? input.address?.number.trim()
              ? input.address.number.trim().slice(0, ADDRESS_NUMBER_MAX_LENGTH)
              : null
            : null,
        addressComplement:
          fillNow && !isArranged
            ? input.address?.complement?.trim()
              ? input.address.complement
                  .trim()
                  .slice(0, ADDRESS_COMPLEMENT_MAX_LENGTH)
              : null
            : null,
        addressNeighborhood:
          fillNow && !isArranged
            ? input.address?.neighborhood.trim() || null
            : null,
        addressCity:
          fillNow && !isArranged ? input.address?.city.trim() || null : null,
        addressState:
          fillNow && !isArranged
            ? input.address?.state.trim().toUpperCase().slice(0, 2) || null
            : null,
        expiresAt: new Date(Date.now() + ORDER_PENDING_TTL_MS),
        items: {
          create: pricing.lines.map((line) => ({
            productId: line.productId,
            productName: line.productName,
            productDescription: line.productDescription,
            productImageUrl: line.productImageUrl,
            quantity: line.quantity,
            catalogListPrice: line.catalogListPrice,
            catalogPromoPrice: line.catalogPromoPrice,
            catalogUnitPrice: line.catalogUnitPrice,
            itemDiscountMode: line.itemDiscountMode,
            itemDiscountValue: line.itemDiscountValue,
            itemDiscountAmount: line.itemDiscountAmount,
            lineSubtotalOriginal: line.lineSubtotalOriginal,
            lineSubtotalFinal: line.lineSubtotalFinal,
            price: line.unitPrice,
            pieceSelectionsJson: serializePieceSelections(line.pieceSelections),
          })),
        },
      },
      select: { id: true, orderNumber: true },
    });

    const charge = await tx.orderCharge.create({
      data: {
        orderId: order.id,
        sequence: 1,
        amount: pricing.total,
        status: input.paymentAlreadyPaid
          ? ORDER_CHARGE_STATUS.PAID
          : ORDER_CHARGE_STATUS.PENDING,
        reason: ORDER_CHARGE_REASON.INITIAL,
        paidAt: input.paymentAlreadyPaid ? new Date() : null,
      },
      select: { id: true },
    });

    await tx.orderItem.updateMany({
      where: { orderId: order.id },
      data: {
        chargeId: charge.id,
        paymentStatus: input.paymentAlreadyPaid
          ? ORDER_ITEM_PAYMENT_STATUS.PAID
          : ORDER_ITEM_PAYMENT_STATUS.PENDING,
        paidAt: input.paymentAlreadyPaid ? new Date() : null,
      },
    });

    const stockLines = pricing.lines
      .filter(
        (l): l is typeof l & { productId: string } =>
          typeof l.productId === "string" && l.productId.length > 0
      )
      .map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        price: l.unitPrice,
        pieceSelections: l.pieceSelections,
      }));

    if (input.paymentAlreadyPaid) {
      const { reserveStockForOrderLines, commitStockReservations } = await import(
        "@/lib/orders/stock/reservation"
      );
      if (stockLines.length > 0) {
        await reserveStockForOrderLines(tx, order.id, stockLines);
        await commitStockReservations(tx, order.id);
      }
      const { cashLedgerIdempotencyKey } = await import(
        "@/lib/cash/idempotency"
      );
      const { appendCashLedgerEntry } = await import("@/lib/cash/ledger");
      await appendCashLedgerEntry(tx, {
        direction: "IN",
        kind: "SALE",
        amount: pricing.total,
        description: `Venda avulsa · pedido #${order.orderNumber ?? order.id.slice(0, 8)}`,
        orderId: order.id,
        actorUserId: input.createdByUserId,
        idempotencyKey: cashLedgerIdempotencyKey("sale", order.id),
      });
    } else if (stockLines.length > 0) {
      await reserveStockForOrderLines(tx, order.id, stockLines);
    }

    return order;
  });

  if (input.paymentAlreadyPaid) {
    const { onOrderPaymentConfirmed } = await import(
      "@/lib/fulfillment/fulfillment-service"
    );
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        id: true,
        fulfillmentType: true,
        customerDataStatus: true,
        recipientName: true,
        addressStreet: true,
        addressCity: true,
        addressState: true,
        destinationCep: true,
      },
    });
    await onOrderPaymentConfirmed(order);
  }

  let payment:
    | {
        type: "pix";
        paymentUrl: string;
        paymentPath: string;
        pixCode: string;
        pixQrBase64: string | null;
        amount: number;
      }
    | { type: "card"; checkoutUrl: string }
    | undefined;

  if (!input.paymentAlreadyPaid) {
    const pay = await initiateOrderPayment({
      orderId: created.id,
      paymentMethod: input.paymentMethod,
    });
    if (!pay.ok) {
      if (pay.canRollbackOrder) {
        const rolledBack = await rollbackAdminSaleAfterPaymentFailure(created.id);
        if (!rolledBack) {
          return {
            ok: false,
            error:
              "O pagamento não foi criado, mas não foi possível desfazer a venda automaticamente. Atualize a listagem antes de tentar novamente.",
          };
        }
      }
      return { ok: false, error: pay.error };
    }
    if (pay.type === "pix") {
      const token = await ensureOrderPaymentToken(created.id);
      if (!token) {
        return {
          ok: false,
          error: "Não foi possível gerar o link de pagamento Pix.",
        };
      }
      payment = {
        type: "pix",
        paymentUrl: token.paymentUrl,
        paymentPath: token.paymentPath,
        pixCode: pay.pixCode,
        pixQrBase64: pay.pixQrBase64,
        amount: pay.amount,
      };
    } else {
      payment = { type: "card", checkoutUrl: pay.checkoutUrl };
    }
  }

  return {
    ok: true,
    orderId: created.id,
    orderNumber: created.orderNumber!,
    total: pricing.total,
    ...(tokenData ? { customerDataUrl: buildCustomerDataUrl(tokenData.token) } : {}),
    ...(payment ? { payment } : {}),
  };
}

export async function markArrangedOrderShipped(input: {
  orderId: string;
  shippedByUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      fulfillmentType: true,
      status: true,
      paidAt: true,
      deliveredAt: true,
    },
  });

  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.fulfillmentType !== FulfillmentType.ARRANGED) {
    return { ok: false, error: "Esta ação só se aplica a entregas a combinar." };
  }
  if (!order.paidAt) {
    return { ok: false, error: "O pedido precisa estar pago." };
  }
  if (order.status === "cancelled") {
    return { ok: false, error: "Pedido cancelado." };
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      shippingStatus: "delivered",
      arrangedShippedAt: new Date(),
      arrangedShippedByUserId: input.shippedByUserId,
      ...deliveredAtOnStatusChange({
        currentDeliveredAt: order.deliveredAt,
        nextShippingStatus: "delivered",
      }),
    },
  });

  return { ok: true };
}
