"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { OrderItemsEditor } from "@/components/admin/OrderItemsEditor";
import { formatPrice } from "@/lib/format";
import { formatDeliveryDaysLabel } from "@/lib/shipping/delivery-days-label";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import type { Product } from "@/lib/types";
import { StandaloneSaleWizard } from "@/components/admin/StandaloneSaleWizard";
import {
  isPendingAdminSaleCustomer,
  orderCustomerDisplayEmail,
  orderCustomerDisplayName,
  shouldOfferCustomerDataFillLink,
} from "@/lib/admin-sale/customer-display";
import {
  composeDeliveryNotesFromUserEdit,
  orderDeliveryUserNotes,
  parseArrangedDeliveryMode,
  resolveArrangedDeliveryDisplay,
  resolveShippingFeeDisplay,
  shippingFeeDisplayText,
  splitArrangedDeliveryNotes,
  arrangedDeliveryLabelFromServiceName,
  ARRANGED_DELIVERY_LABELS,
  type ArrangedDeliveryMode,
} from "@/lib/admin-sale/arranged-delivery";
import { OrderNotesHint } from "@/components/admin/OrderNotesHint";
import {
  ADDRESS_COMPLEMENT_MAX_LENGTH,
  ADDRESS_NUMBER_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  customerContactAddressValidationError,
  isCustomerContactAddressComplete,
} from "@/lib/admin-sale/customer-form-complete";
import {
  cepMask,
  cpfFmt,
  lookupAddressByCep,
  onlyDigits,
  phoneFmt,
} from "@/lib/admin-sale/customer-form-input";
import { cpfValidationError } from "@/lib/validation/cpf";
import { useAuth } from "@/components/auth/AuthProvider";
import { PERMISSION } from "@/lib/auth/permissions";

/* ─── Tipos ───────────────────────────────────────────────────────── */

type OrderProduct = {
  id: string;
  name: string;
  description?: string | null;
  images: { url: string }[];
};

type OrderItem = {
  id: string;
  quantity: number;
  price: number;
  pieceSelectionsJson: string | null;
  productId?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  productImageUrl?: string | null;
  paymentStatus?: string | null;
  product: OrderProduct | null;
};

type AdminOrder = {
  id: string;
  orderNumber: number | null;
  email: string | null;
  status: string;
  orderSource?: string;
  fulfillmentType?: string;
  customerDataStatus?: string | null;
  customerDataToken?: string | null;
  paymentToken?: string | null;
  paymentChannel?: string | null;
  paymentShare?:
    | { type: "pix"; paymentPath: string; paymentToken: string }
    | { type: "card"; checkoutUrl: string };
  subtotalOriginal?: number | null;
  itemsDiscountTotal?: number;
  orderDiscountAmount?: number;
  deliveryNotes?: string | null;
  internalNotes?: string | null;
  total: number;
  paidTotal?: number;
  shippingAmount: number;
  shippingServiceName: string | null;
  destinationCep: string | null;
  recipientName: string | null;
  phone: string | null;
  cpf: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  paidAt: string | null;
  paymentMethod?: string | null;
  paymentCaptureMethod: string | null;
  shippingStatus: string;
  shippingProvider?: string | null;
  superfreteStatus: string | null;
  trackingCode: string | null;
  superfreteShipmentId: string | null;
  labelUrl: string | null;
  labelAutoGenerateError: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  user: { name: string; email: string; phone: string } | null;
  createdBy?: { name: string | null; role?: string | null } | null;
  items: OrderItem[];
};

type ApiResponse = { orders: AdminOrder[]; total: number; page: number; limit: number };
type FilterKey = "paid" | "waiting" | "to_pack" | "cancelled";

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function orderCustomerName(order: AdminOrder): string {
  return orderCustomerDisplayName(order);
}

function orderMatchesCustomerSearch(order: AdminOrder, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const haystack = [
    orderCustomerName(order),
    order.email ?? "",
    order.user?.name ?? "",
    order.recipientName ?? "",
  ]
    .map(normalizeSearchText)
    .join(" ");

  return haystack.includes(normalizedQuery);
}

function orderHasUnpaidItems(order: AdminOrder): boolean {
  return order.items.some((item) => {
    if (item.paymentStatus) return item.paymentStatus === "pending";
    return !order.paidAt;
  });
}

function orderPayableAmount(order: AdminOrder): number {
  const pending = order.items.filter((item) =>
    item.paymentStatus
      ? item.paymentStatus === "pending"
      : !order.paidAt
  );
  if (order.paidAt && pending.length > 0) {
    return pending.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }
  return order.total;
}

function manualMarkPaidOrderPatch(order: AdminOrder): Partial<AdminOrder> {
  const isAddon = Boolean(order.paidAt) && orderHasUnpaidItems(order);
  const now = new Date().toISOString();
  return {
    paidAt: order.paidAt ?? now,
    status: "paid",
    paymentChannel: isAddon ? order.paymentChannel : "MANUAL",
    paidTotal: isAddon
      ? (order.paidTotal ?? 0) + orderPayableAmount(order)
      : order.total,
    items: order.items.map((item) =>
      (item.paymentStatus ?? "pending") === "paid"
        ? item
        : { ...item, paymentStatus: "paid" }
    ),
    cancellationReason: null,
    cancelledAt: null,
    ...(isAddon ? {} : { shippingStatus: "to_pack" }),
  };
}

function isInactiveSale(order: AdminOrder): boolean {
  return order.status === "cancelled" || order.status === "expired";
}

function gatewayMethodForCancelledSale(order: AdminOrder): "pix" | "card" | null {
  if (!isInactiveSale(order) || order.paidAt) return null;
  if (order.paymentChannel === "MANUAL") return null;
  return (
    resolvePaymentMethodKind(order.paymentMethod ?? null) ??
    (order.paymentShare?.type === "pix" || order.paymentShare?.type === "card"
      ? order.paymentShare.type
      : null)
  );
}

function switchablePaymentMethod(order: AdminOrder): "pix" | "card" | null {
  if (isInactiveSale(order) || order.paidAt) return null;
  if (order.paymentChannel === "MANUAL") return null;
  const current =
    resolvePaymentMethodKind(order.paymentMethod ?? null) ??
    (order.paymentShare?.type === "pix" || order.paymentShare?.type === "card"
      ? order.paymentShare.type
      : null);
  if (current === "pix") return "card";
  if (current === "card") return "pix";
  return null;
}

function orderMatchesStatusFilter(order: AdminOrder, filter: FilterKey | null): boolean {
  const inactive = isInactiveSale(order);
  if (filter === "cancelled") return inactive;
  if (inactive) return false;
  if (!filter) return true;
  if (filter === "paid") return Boolean(order.paidAt);
  if (filter === "waiting") return !order.paidAt;
  return Boolean(order.paidAt && order.shippingStatus === "to_pack");
}

function toLocalDateKey(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type SaleDateRange = { from: string; to: string };

const EMPTY_SALE_DATE_RANGE: SaleDateRange = { from: "", to: "" };

function normalizeSaleDateRange(
  from: string,
  to: string
): { from: string; to: string } | null {
  if (!from && !to) return null;
  if (!from) return { from: to, to };
  if (!to) return { from, to: from };
  return from <= to ? { from, to } : { from: to, to: from };
}

function orderMatchesSaleDateRange(
  order: AdminOrder,
  range: SaleDateRange
): boolean {
  const normalized = normalizeSaleDateRange(range.from, range.to);
  if (!normalized) return true;
  if (!order.paidAt) return false;

  const orderDate = toLocalDateKey(order.paidAt);
  return orderDate >= normalized.from && orderDate <= normalized.to;
}

function orderMatchesOriginFilter(
  order: AdminOrder,
  originFilter: string | null
): boolean {
  if (!originFilter) return true;
  return orderOriginLabel(order) === originFilter;
}

function collectOriginFilterOptions(orders: AdminOrder[]): string[] {
  const labels = new Set(orders.map(orderOriginLabel));
  const preferred = ["checkout", "Admin", "Avulsa"];
  const rest = [...labels]
    .filter((label) => !preferred.includes(label))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...preferred.filter((label) => labels.has(label)), ...rest];
}

function formatDateFilterLabel(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatSaleDateRangeLabel(range: SaleDateRange): string {
  const normalized = normalizeSaleDateRange(range.from, range.to);
  if (!normalized) return "";

  if (normalized.from === normalized.to) {
    return formatDateFilterLabel(normalized.from);
  }

  return `${formatDateFilterLabel(normalized.from)} – ${formatDateFilterLabel(normalized.to)}`;
}

function hasSaleDateRangeSelection(range: SaleDateRange): boolean {
  return Boolean(range.from || range.to);
}

type DayRangeState = "none" | "edge" | "middle";

function getDayRangeState(
  key: string,
  range: SaleDateRange,
  anchor: string | null
): DayRangeState {
  const preview = anchor && range.from && !range.to
    ? normalizeSaleDateRange(range.from, anchor)
    : normalizeSaleDateRange(range.from, range.to);

  if (!preview) {
    if (anchor && key === anchor) return "edge";
    if (range.from && !range.to && key === range.from) return "edge";
    return "none";
  }

  if (key < preview.from || key > preview.to) return "none";
  if (key === preview.from || key === preview.to) return "edge";
  return "middle";
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function buildDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function mondayBasedWeekday(year: number, month: number): number {
  const weekday = new Date(year, month, 1).getDay();
  return weekday === 0 ? 6 : weekday - 1;
}

const CALENDAR_WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const SALES_TOOLBAR_SIZE =
  "box-border h-9 text-sm font-medium leading-none sm:h-8";

const SALES_TOOLBAR_CONTROL = `${SALES_TOOLBAR_SIZE} rounded-lg border px-3 sm:px-3.5`;

const DETAILS_DRAWER_MS = 300;

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M4.5 8.25h15m-13.5 0V18a2.25 2.25 0 0 0 2.25 2.25h10.5A2.25 2.25 0 0 0 21 18V8.25m-18 0V6.375c0-.621.504-1.125 1.125-1.125h15.75c.621 0 1.125.504 1.125 1.125V8.25"
      />
    </svg>
  );
}

function SaleDatePicker({
  range,
  onChange,
}: {
  range: SaleDateRange;
  onChange: (range: SaleDateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toLocalDateKey(today.toISOString()), [today]);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const hasSelection = hasSaleDateRangeSelection(range);
  const rangeLabel = formatSaleDateRangeLabel(range);
  const isSelectingEnd = Boolean(range.from && !range.to);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
      }).format(new Date(viewYear, viewMonth, 1)),
    [viewYear, viewMonth]
  );

  const calendarCells = useMemo(() => {
    const leadingBlanks = mondayBasedWeekday(viewYear, viewMonth);
    const totalDays = daysInMonth(viewYear, viewMonth);
    const cells: Array<{ key: string; day: number } | null> = [];

    for (let index = 0; index < leadingBlanks; index += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push({
        key: buildDateKey(viewYear, viewMonth, day),
        day,
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setRangeAnchor(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function selectDay(key: string) {
    if (!range.from || (range.from && range.to)) {
      onChange({ from: key, to: "" });
      setRangeAnchor(key);
      return;
    }

    const normalized = normalizeSaleDateRange(range.from, key);
    if (!normalized) return;

    onChange(normalized);
    setRangeAnchor(null);
  }

  function goToPreviousMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((year) => year - 1);
      return;
    }
    setViewMonth((month) => month - 1);
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((year) => year + 1);
      return;
    }
    setViewMonth((month) => month + 1);
  }

  function clearSelection() {
    onChange(EMPTY_SALE_DATE_RANGE);
    setRangeAnchor(null);
  }

  function dayButtonClass(key: string): string {
    const state = getDayRangeState(key, range, rangeAnchor);
    const base =
      "flex h-9 w-9 items-center justify-center text-sm font-medium transition-colors";

    if (state === "edge") {
      return `${base} rounded-lg bg-stone-900 text-white shadow-sm`;
    }
    if (state === "middle") {
      return `${base} rounded-lg bg-stone-200 text-stone-800`;
    }
    if (key === todayKey) {
      return `${base} rounded-lg border border-stone-300 bg-stone-50 text-stone-900 hover:bg-stone-100`;
    }
    return `${base} rounded-lg text-stone-700 hover:bg-stone-100`;
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex shrink-0 items-center gap-2 transition-colors ${SALES_TOOLBAR_CONTROL} ${hasSelection
            ? "border-stone-900 bg-stone-900 text-white"
            : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50"
          }`}
      >
        <CalendarIcon className="h-4 w-4 shrink-0" />
        <span>Data</span>
      </button>

      {mounted && open
        ? createPortal(
          <>
            <button
              type="button"
              aria-label="Fechar calendário"
              className="fixed inset-0 z-[100] bg-stone-900/25 backdrop-blur-[1px]"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Selecionar intervalo pela data de pagamento"
              className="fixed left-1/2 top-1/2 z-[101] w-[min(calc(100vw-2rem),19rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={goToPreviousMonth}
                  aria-label="Mês anterior"
                  className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19 8 12l7-7"
                    />
                  </svg>
                </button>

                <p className="text-sm font-semibold capitalize text-stone-900">
                  {monthLabel}
                </p>

                <button
                  type="button"
                  onClick={goToNextMonth}
                  aria-label="Próximo mês"
                  className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>

              <div className="mb-1 grid grid-cols-7 gap-1">
                {CALENDAR_WEEKDAYS.map((weekday) => (
                  <div
                    key={weekday}
                    className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-stone-400"
                  >
                    {weekday}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((cell, index) =>
                  cell ? (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => selectDay(cell.key)}
                      aria-pressed={getDayRangeState(cell.key, range, rangeAnchor) !== "none"}
                      className={dayButtonClass(cell.key)}
                    >
                      {cell.day}
                    </button>
                  ) : (
                    <div
                      key={`blank-${index}`}
                      className="h-9 w-9"
                      aria-hidden
                    />
                  )
                )}
              </div>

              {hasSelection || isSelectingEnd ? (
                <div className="mt-3 border-t border-stone-100 pt-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                    Período selecionado
                  </p>
                  <p className="text-sm font-medium text-stone-800">
                    {isSelectingEnd
                      ? `${formatDateFilterLabel(range.from)} – …`
                      : rangeLabel}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone-100 pt-3">
                <p className="text-xs text-stone-500">
                  {isSelectingEnd
                    ? "Agora escolha o dia final"
                    : hasSelection
                      ? "Intervalo aplicado ao filtro"
                      : "Escolha o dia inicial e depois o final"}
                </p>
                <div className="flex items-center gap-2">
                  {hasSelection ? (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="text-xs font-medium text-stone-500 transition-colors hover:text-stone-800"
                    >
                      Limpar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-stone-800"
                  >
                    Ok
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
        : null}
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
}
function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function fmtFull(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
}

function paymentMethodLabel(method: string | null): string {
  if (!method) return "—";
  const m = method.toLowerCase();
  if (m.includes("pix")) return "Pix";
  if (m.includes("credit") || m.includes("credito") || m.includes("crédito")) return "Cartão crédito";
  if (m.includes("debit") || m.includes("debito") || m.includes("débito")) return "Cartão débito";
  if (m.includes("boleto")) return "Boleto";
  return method;
}

function resolvePaymentMethodKind(method: string | null): "pix" | "card" | null {
  if (!method) return null;
  const m = method.toLowerCase();
  if (m.includes("pix")) return "pix";
  if (
    m.includes("credit") ||
    m.includes("credito") ||
    m.includes("crédito") ||
    m.includes("debit") ||
    m.includes("debito") ||
    m.includes("débito") ||
    m.includes("card") ||
    m.includes("cartao") ||
    m.includes("cartão")
  ) {
    return "card";
  }
  return null;
}

const TABLE_CELL_PRIMARY = "text-sm font-medium text-stone-900 truncate";
const TABLE_CELL_SECONDARY = "text-xs font-normal text-stone-500 truncate";

function cpfDisplay(v: string | null): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return v;
}
function cepDisplay(v: string | null): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v;
}

function hasOrderAddress(order: AdminOrder): boolean {
  return Boolean(
    order.addressStreet ||
    order.addressNumber ||
    order.addressComplement ||
    order.addressNeighborhood ||
    order.addressCity ||
    order.addressState ||
    order.destinationCep
  );
}

function displayOrDash(v: string | null | undefined): string {
  const t = v?.trim();
  return t ? t : "—";
}

type ShippingTone = "amber" | "stone" | "blue" | "emerald" | "red";

const SHIPPING_STATUS = [
  { value: "to_pack", label: "Por embalar", tone: "amber" },
  { value: "packed", label: "Por enviar", tone: "stone" },
  { value: "shipped", label: "Enviado", tone: "blue" },
  { value: "delivered", label: "Entregue", tone: "emerald" },
  { value: "cancelled", label: "Cancelado", tone: "red" },
] as const satisfies ReadonlyArray<{ value: string; label: string; tone: ShippingTone }>;

function sInfo(v: string) {
  return SHIPPING_STATUS.find((s) => s.value === v) ?? SHIPPING_STATUS[0];
}

function payBadge(order: AdminOrder) {
  if (order.paidAt && orderHasUnpaidItems(order)) {
    return { label: "Pago parcial", cls: "bg-amber-50 text-amber-800 ring-amber-200" };
  }
  if (order.paidAt) return { label: "Pago", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  return { label: "Aguardando", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
}

function Chip({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>{label}</span>;
}

function PaymentStatusBadge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

function PaymentMethodIcon({ kind }: { kind: "pix" | "card" }) {
  if (kind === "pix") {
    return (
      <svg
        className="h-4 w-4 shrink-0 text-stone-400"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-label="PIX"
      >
        <path d="M11.917 11.71a2.046 2.046 0 0 1-1.454-.602l-2.1-2.1a.4.4 0 0 0-.551 0l-2.108 2.108a2.044 2.044 0 0 1-1.454.602h-.414l2.66 2.66c.83.83 2.177.83 3.007 0l2.667-2.668h-.253zM4.25 4.282c.55 0 1.066.214 1.454.602l2.108 2.108a.39.39 0 0 0 .552 0l2.1-2.1a2.044 2.044 0 0 1 1.453-.602h.253L9.503 1.623a2.127 2.127 0 0 0-3.007 0l-2.66 2.66h.414z" />
        <path d="m14.377 6.496-1.612-1.612a.307.307 0 0 1-.114.023h-.733c-.379 0-.75.154-1.017.422l-2.1 2.1a1.005 1.005 0 0 1-1.425 0L5.268 5.32a1.448 1.448 0 0 0-1.018-.422h-.9a.306.306 0 0 1-.109-.021L1.623 6.496c-.83.83-.83 2.177 0 3.008l1.618 1.618a.305.305 0 0 1 .108-.022h.901c.38 0 .75-.153 1.018-.421L7.375 8.57a1.034 1.034 0 0 1 1.426 0l2.1 2.1c.267.268.638.421 1.017.421h.733c.04 0 .079.01.114.024l1.612-1.612c.83-.83.83-2.178 0-3.008z" />
      </svg>
    );
  }

  return (
    <svg
      className="h-4 w-4 shrink-0 text-stone-400"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-label="Cartão"
    >
      <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3Z" />
    </svg>
  );
}

function TablePaymentCell({ order }: { order: AdminOrder }) {
  const paymentStatus = tablePaymentStatus(order);
  // Exibe a opção escolhida ao criar o link, não o meio usado dentro do gateway.
  const methodKind = resolvePaymentMethodKind(order.paymentMethod ?? null);

  return (
    <div className="flex items-start gap-1.5">
      {methodKind ? (
        <span className="mt-1 inline-flex">
          <PaymentMethodIcon kind={methodKind} />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <PaymentStatusBadge label={paymentStatus.label} cls={paymentStatus.cls} />
        {order.paidAt ? (
          <p className={`whitespace-nowrap ${TABLE_CELL_SECONDARY}`}>
            {fmtDate(order.paidAt)} {fmtTime(order.paidAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function tablePaymentStatus(order: AdminOrder) {
  return payBadge(order);
}

const TABLE_SHIPPING_LABELS: Record<string, string> = {
  to_pack: "Por embalar",
  packed: "Por enviar",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

function tableShippingLabel(status: string): string {
  return TABLE_SHIPPING_LABELS[status] ?? sInfo(status).label;
}

function StatusIcon({
  className = "h-3.5 w-3.5 shrink-0",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function TruckIcon({ className = "h-3.5 w-3.5 shrink-0" }: { className?: string }) {
  return (
    <StatusIcon className={className}>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </StatusIcon>
  );
}

function shippingStatusIcon(status: string) {
  switch (status) {
    case "to_pack":
      return (
        <StatusIcon>
          <path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </StatusIcon>
      );
    case "packed":
      return (
        <StatusIcon>
          <path d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
        </StatusIcon>
      );
    case "shipped":
      return <TruckIcon />;
    case "delivered":
      return (
        <StatusIcon>
          <path d="M9 12.75 11.25 15 15 9.75" />
          <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </StatusIcon>
      );
    case "cancelled":
      return (
        <StatusIcon>
          <path d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5" />
          <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </StatusIcon>
      );
    default:
      return <TruckIcon />;
  }
}

const SHIPPING_TONE_CLASS: Record<ShippingTone, string> = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  stone: "bg-stone-50 text-stone-700 ring-stone-200",
  blue: "bg-blue-50 text-blue-900 ring-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
};

function ShippingStatusBadge({
  label,
  tone,
  status,
}: {
  label: string;
  tone: ShippingTone;
  status: string;
}) {
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${SHIPPING_TONE_CLASS[tone]}`}
    >
      {shippingStatusIcon(status)}
      {label}
    </span>
  );
}

function TableShippingStatus({
  status,
  shippingMethod,
}: {
  status: string;
  shippingMethod: string | null;
}) {
  const label = tableShippingLabel(status);
  const ss = sInfo(status);

  return (
    <div className="flex flex-col items-start gap-0.5">
      <ShippingStatusBadge label={label} tone={ss.tone} status={status} />
      {shippingMethod ? (
        <p className={`whitespace-nowrap ${TABLE_CELL_SECONDARY}`}>{shippingMethod}</p>
      ) : null}
    </div>
  );
}

function shortShippingMethod(
  serviceName: string | null,
  fulfillmentType?: string,
  deliveryNotes?: string | null
): string | null {
  if (fulfillmentType === "ARRANGED") {
    const fromService = arrangedDeliveryLabelFromServiceName(serviceName);
    if (fromService) return fromService;
    const split = splitArrangedDeliveryNotes(deliveryNotes);
    return split.systemLabel;
  }
  if (!serviceName?.trim()) return null;

  const lower = serviceName.toLowerCase();
  if (lower.includes("sedex")) return "SEDEX";
  if (/\bpac\b/i.test(lower) || lower.includes(" pac ") || lower.startsWith("pac ")) return "PAC";
  if (lower.includes("jadlog")) return "Jadlog";
  if (lower.includes("loggi")) return "Loggi";

  const servicePart = serviceName.split("—").pop()?.trim() ?? serviceName.trim();
  if (/sedex/i.test(servicePart)) return "SEDEX";
  if (/\bpac\b/i.test(servicePart)) return "PAC";
  if (/jadlog/i.test(servicePart)) return "Jadlog";
  if (/loggi/i.test(servicePart)) return "Loggi";

  return servicePart.length > 18 ? `${servicePart.slice(0, 16)}…` : servicePart;
}

function saleDeliveryUserNotes(order: AdminOrder): string | null {
  return orderDeliveryUserNotes({
    fulfillmentType: order.fulfillmentType,
    shippingServiceName: order.shippingServiceName,
    deliveryNotes: order.deliveryNotes,
    shippingAmount: order.shippingAmount,
  });
}

function ExpandedSection({
  title,
  children,
  className = "",
  headerAction,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-stone-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        {headerAction}
      </div>
      {children}
    </div>
  );
}

const ARRANGED_DELIVERY_OPTIONS: {
  id: ArrangedDeliveryMode;
  hint?: string;
}[] = [
  { id: "store_delivery", hint: "Frete a combinar" },
  { id: "pickup" },
  { id: "uber", hint: "Frete a combinar" },
];

function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    </svg>
  );
}

type CustomerEditForm = {
  recipientName: string;
  email: string;
  phone: string;
  cpf: string;
  destinationCep: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  internalNotes: string;
  deliveryNotes: string;
};

function customerEditFormFromOrder(order: AdminOrder): CustomerEditForm {
  return {
    recipientName: order.recipientName ?? "",
    email: order.email ?? "",
    phone: phoneFmt(order.phone || order.user?.phone || ""),
    cpf: cpfFmt(order.cpf ?? ""),
    destinationCep: cepMask(onlyDigits(order.destinationCep ?? "", 8)),
    addressStreet: order.addressStreet ?? "",
    addressNumber: order.addressNumber ?? "",
    addressComplement: order.addressComplement ?? "",
    addressNeighborhood: order.addressNeighborhood ?? "",
    addressCity: order.addressCity ?? "",
    addressState: order.addressState ?? "",
    internalNotes: order.internalNotes ?? "",
    deliveryNotes: saleDeliveryUserNotes(order) ?? "",
  };
}

function EditField({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-500">
        {label}
        {optional ? <span className="ml-1 font-normal text-stone-400">(opcional)</span> : null}
      </label>
      {children}
    </div>
  );
}

function EditInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 ${props.className ?? ""}`}
    />
  );
}

function EditTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 ${props.className ?? ""}`}
    />
  );
}

function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatOrderAddressBlock(order: AdminOrder): string | null {
  if (!hasOrderAddress(order)) return null;
  const street = [order.addressStreet, order.addressNumber].filter(Boolean).join(", ");
  const city = [order.addressNeighborhood, order.addressCity, order.addressState]
    .filter(Boolean)
    .join(" · ");
  const cep = cepDisplay(order.destinationCep);
  return [street || null, order.addressComplement?.trim() || null, city || null, cep !== "—" ? cep : null]
    .filter(Boolean)
    .join("\n");
}

function ReceiptLine({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 text-sm ${bold ? "font-semibold text-stone-900" : ""}`}>
      <span className={bold ? "" : "text-stone-500"}>{label}</span>
      <span className={`tabular-nums ${bold ? "" : "text-stone-800"}`}>{value}</span>
    </div>
  );
}

/** URL absoluta para compartilhar pagamento — usa dados já vindos da listagem. */
function orderPaymentShareAbsoluteUrl(order: AdminOrder): string | null {
  const share = order.paymentShare;
  if (!share) {
    if (order.paymentToken) {
      return `${window.location.origin}/venda-avulsa/pagar/${order.paymentToken}`;
    }
    return null;
  }
  if (share.type === "pix") {
    return `${window.location.origin}${share.paymentPath}`;
  }
  return share.checkoutUrl;
}

function orderRefLabel(order: Pick<AdminOrder, "orderNumber">): string {
  return order.orderNumber != null ? ` #${order.orderNumber}` : "";
}

/** Origem na listagem: checkout do site ou quem registrou a venda avulsa. */
function orderOriginLabel(order: AdminOrder): string {
  if (order.orderSource === "ADMIN_SALE") {
    if (order.createdBy?.role === "ADMIN") return "Admin";
    const fullName = order.createdBy?.name?.trim();
    if (!fullName) return "Avulsa";
    return fullName.split(/\s+/)[0] ?? "Avulsa";
  }
  return "checkout";
}

function shareGreeting(order: AdminOrder): string {
  if (isPendingAdminSaleCustomer(order)) return "Oi!";
  const full =
    order.recipientName?.trim() ||
    order.user?.name?.trim() ||
    "";
  const first = full.split(/\s+/)[0];
  return first ? `Oi, ${first}!` : "Oi!";
}

/** Mensagem pronta para WhatsApp (link de preenchimento de dados). */
function buildCustomerDataShareMessage(order: AdminOrder, url: string): string {
  return [
    "",
    `📦 Para prosseguirmos com a entrega do seu pedido${orderRefLabel(order)}, por favor, preencha seus dados neste link:`,
    "",
    url,
    "",
    "Qualquer dúvida, é só me chamar por aqui.",
  ].join("\n");
}

/** Mensagem pronta para WhatsApp (link da página de pagamento Pix). */
function buildPixShareMessage(
  order: AdminOrder,
  paymentUrl: string,
  amount: number
): string {
  return [
    "",
    `Seu pedido${orderRefLabel(order)} foi gerado com sucesso!`,
    "",
    `Valor: ${formatPrice(amount)}`,
    "",
    "Para realizar o pagamento, acesse o link abaixo e pague com Pix:",
    "",
    paymentUrl,
    "",
    "Assim que o pagamento for confirmado, avisaremos você por aqui. 😊",
  ].join("\n");
}

/** Mensagem pronta para WhatsApp (pagamento com cartão). */
function buildCardShareMessage(order: AdminOrder, checkoutUrl: string): string {
  return [
    // "",
    // `Seu pedido${orderRefLabel(order)} foi gerado com sucesso!`,
    // "",
    // `Valor: ${formatPrice(order.total)}`,
    // "",
    // "Para realizar o pagamento, acesse o link abaixo e conclua com cartão de crédito:",
    // "",
    checkoutUrl,
    // "",
    // "Assim que o pagamento for confirmado, avisaremos você por aqui. 😊",
  ].join("\n");
}

type PaymentLinkMethod = "pix" | "card";

type PaymentInfoResponse = {
  type?: "pix" | "card" | "paid";
  checkoutUrl?: string;
  paymentPath?: string;
  paymentToken?: string;
  amount?: number;
  error?: string;
};

async function postPaymentInfo(
  orderId: string,
  body: { forceNew: boolean; paymentMethod?: PaymentLinkMethod }
): Promise<{ ok: boolean; data: PaymentInfoResponse }> {
  const res = await fetch(`/api/admin/orders/${orderId}/payment-info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as PaymentInfoResponse;
  return { ok: res.ok, data };
}

function reactivatedSalePatch(
  method: PaymentLinkMethod,
  data: PaymentInfoResponse
): Partial<AdminOrder> {
  const patch: Partial<AdminOrder> = {
    status: "pending_payment",
    cancelledAt: null,
    cancellationReason: null,
    shippingStatus: "to_pack",
    paymentMethod: method,
    paymentChannel: "GATEWAY",
  };
  if (data.type === "card" && data.checkoutUrl) {
    patch.paymentShare = { type: "card", checkoutUrl: data.checkoutUrl };
  }
  if (data.type === "pix") {
    if (data.paymentToken) patch.paymentToken = data.paymentToken;
    if (data.paymentPath && data.paymentToken) {
      patch.paymentShare = {
        type: "pix",
        paymentPath: data.paymentPath,
        paymentToken: data.paymentToken,
      };
    }
  }
  return patch;
}

async function generatePaymentLinkAndCopy(
  order: AdminOrder,
  method: PaymentLinkMethod,
  onPatchOrder: (id: string, patch: Partial<AdminOrder>) => void,
  failMessage: string
): Promise<PaymentLinkMethod | null> {
  const { ok, data } = await postPaymentInfo(order.id, {
    forceNew: true,
    paymentMethod: method,
  });
  if (!ok) {
    window.alert(data.error ?? failMessage);
    return null;
  }
  if (data.type === "paid") {
    window.alert("Pagamento já confirmado.");
    return null;
  }

  onPatchOrder(order.id, reactivatedSalePatch(method, data));

  try {
    if (method === "pix") {
      const path =
        data.paymentPath ??
        (data.paymentToken ? `/venda-avulsa/pagar/${data.paymentToken}` : null);
      if (!path) {
        window.alert("Link gerado. Atualize a lista se o Pix não aparecer.");
        return method;
      }
      await navigator.clipboard.writeText(
        buildPixShareMessage(
          order,
          `${window.location.origin}${path}`,
          data.amount ?? orderPayableAmount(order)
        )
      );
      return method;
    }

    if (data.type !== "card" || !data.checkoutUrl) {
      window.alert("Não foi possível gerar um novo link de cartão.");
      return null;
    }
    await navigator.clipboard.writeText(
      buildCardShareMessage(order, data.checkoutUrl)
    );
    return method;
  } catch {
    window.alert("O link foi gerado, mas não foi possível copiar.");
    return method;
  }
}

async function resumeCancelledSaleAndCopy(
  order: AdminOrder,
  onPatchOrder: (id: string, patch: Partial<AdminOrder>) => void
): Promise<PaymentLinkMethod | null> {
  const method = gatewayMethodForCancelledSale(order);
  if (!method) {
    window.alert("Esta venda não tem Pix ou cartão para gerar o link.");
    return null;
  }
  return generatePaymentLinkAndCopy(
    order,
    method,
    onPatchOrder,
    "Não foi possível retomar a venda."
  );
}

function AdminSaleLinks({
  order,
  onPatchOrder,
}: {
  order: AdminOrder;
  onPatchOrder: (id: string, patch: Partial<AdminOrder>) => void;
}) {
  const [copied, setCopied] = useState<"data" | "pix" | "card" | "regen" | null>(
    null
  );
  const [regeneratingCard, setRegeneratingCard] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [switching, setSwitching] = useState(false);

  const showCustomerLink = shouldOfferCustomerDataFillLink(order);
  const resumeMethod = gatewayMethodForCancelledSale(order);
  const canReactivatePayment = resumeMethod != null;
  const switchTarget = switchablePaymentMethod(order);

  const showPaymentLink =
    order.orderSource === "ADMIN_SALE" &&
    !isInactiveSale(order) &&
    orderHasUnpaidItems(order) &&
    !(order.paymentChannel === "MANUAL" && !order.paidAt);
  const isPixPayment =
    order.paymentMethod === "pix" || order.paymentShare?.type === "pix";
  const isCardPayment =
    order.paymentMethod === "card" || order.paymentShare?.type === "card";
  const canRegenerateCardLink =
    showPaymentLink && isCardPayment;
  const paymentUrl = orderPaymentShareAbsoluteUrl(order);

  if (!showCustomerLink && !showPaymentLink && !canReactivatePayment && !switchTarget) {
    return null;
  }

  async function copyText(
    value: string,
    key: "data" | "pix" | "card" | "regen"
  ) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.alert("Não foi possível copiar. Tente novamente.");
    }
  }

  async function regenerateCardLink() {
    const label =
      order.orderNumber != null ? `#${order.orderNumber}` : "esta venda";
    const confirmed = window.confirm(
      `Gerar um novo link de cartão para ${label}? Envie o novo link à cliente — o anterior pode deixar de funcionar.`
    );
    if (!confirmed) return;

    setRegeneratingCard(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/payment-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceNew: true }),
      });
      const data = (await res.json()) as {
        type?: "pix" | "card" | "paid";
        checkoutUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        window.alert(data.error ?? "Não foi possível gerar um novo link.");
        return;
      }
      if (data.type === "paid") {
        window.alert("Pagamento já confirmado.");
        return;
      }
      if (data.type !== "card" || !data.checkoutUrl) {
        window.alert("Não foi possível gerar um novo link de cartão.");
        return;
      }
      onPatchOrder(order.id, {
        paymentShare: { type: "card", checkoutUrl: data.checkoutUrl },
      });
      await copyText(buildCardShareMessage(order, data.checkoutUrl), "regen");
    } catch {
      window.alert("Erro de conexão ao gerar o link.");
    } finally {
      setRegeneratingCard(false);
    }
  }

  async function resumeCancelledSale() {
    const label =
      order.orderNumber != null ? `#${order.orderNumber}` : "esta venda";
    const confirmed = window.confirm(
      `Retomar a venda ${label}? Um novo link de ${resumeMethod === "pix" ? "Pix" : "cartão"} será gerado e a venda terá 24 horas para pagamento.`
    );
    if (!confirmed) return;

    setResuming(true);
    try {
      const copied = await resumeCancelledSaleAndCopy(order, onPatchOrder);
      if (copied) {
        setCopied(copied);
        setTimeout(() => setCopied(null), 2000);
      }
    } catch {
      window.alert("Erro de conexão ao retomar a venda.");
    } finally {
      setResuming(false);
    }
  }

  async function switchPaymentMethod() {
    if (!switchTarget) return;
    const label =
      order.orderNumber != null ? `#${order.orderNumber}` : "esta venda";
    const targetLabel = switchTarget === "pix" ? "Pix" : "Cartão";
    const confirmed = window.confirm(
      `Trocar o pagamento da venda ${label} para ${targetLabel}? Um novo link será gerado.`
    );
    if (!confirmed) return;

    setSwitching(true);
    try {
      const copied = await generatePaymentLinkAndCopy(
        order,
        switchTarget,
        onPatchOrder,
        "Não foi possível trocar o método de pagamento."
      );
      if (copied) {
        setCopied(copied);
        setTimeout(() => setCopied(null), 2000);
      }
    } catch {
      window.alert("Erro de conexão ao trocar o pagamento.");
    } finally {
      setSwitching(false);
    }
  }

  const customerUrl =
    order.customerDataToken
      ? `${window.location.origin}/venda-avulsa/completar/${order.customerDataToken}`
      : "";

  return (
    <div className="flex flex-col gap-2">
      {canReactivatePayment ? (
        <button
          type="button"
          disabled={resuming}
          onClick={() => void resumeCancelledSale()}
          className="rounded-lg bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 disabled:opacity-50"
        >
          {resuming
            ? "Retomando venda…"
            : copied === "pix" || copied === "card"
              ? "Link copiado!"
              : "Retomar venda"}
        </button>
      ) : null}

      {showPaymentLink && (
        <>
          {!paymentUrl ? (
            <p className="text-xs text-stone-500">
              Link de pagamento indisponível. Atualize a lista e tente de novo.
            </p>
          ) : null}
          {isPixPayment && paymentUrl ? (
            <button
              type="button"
              onClick={() =>
                void copyText(
                  buildPixShareMessage(order, paymentUrl, orderPayableAmount(order)),
                  "pix"
                )
              }
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
            >
              {copied === "pix" ? "Mensagem copiada!" : "Copiar link Pix"}
            </button>
          ) : null}
          {isCardPayment && paymentUrl ? (
            <button
              type="button"
              onClick={() =>
                void copyText(buildCardShareMessage(order, paymentUrl), "card")
              }
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
            >
              {copied === "card" ? "Mensagem copiada!" : "Copiar link cartão"}
            </button>
          ) : null}
          {canRegenerateCardLink ? (
            <button
              type="button"
              disabled={regeneratingCard || switching}
              onClick={() => void regenerateCardLink()}
              className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900 transition-colors hover:bg-sky-100 disabled:opacity-50"
            >
              {regeneratingCard
                ? "Gerando novo link…"
                : copied === "regen"
                  ? "Novo link copiado!"
                  : "Gerar novo link cartão"}
            </button>
          ) : null}
        </>
      )}

      {switchTarget ? (
        <button
          type="button"
          disabled={switching || regeneratingCard}
          onClick={() => void switchPaymentMethod()}
          className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900 transition-colors hover:bg-sky-100 disabled:opacity-50"
        >
          {switching
            ? "Trocando pagamento…"
            : copied === switchTarget
              ? "Link copiado!"
              : switchTarget === "pix"
                ? "Trocar pagamento para PIX"
                : "Trocar pagamento para Cartão"}
        </button>
      ) : null}

      {showCustomerLink && (
        <button
          type="button"
          onClick={() =>
            void copyText(buildCustomerDataShareMessage(order, customerUrl), "data")
          }
          className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
        >
          {copied === "data" ? "Mensagem copiada!" : "Copiar link de preenchimento de dados"}
        </button>
      )}
    </div>
  );
}

const ORDER_ACTION_MENU_WIDTH = 236;

function ActionMenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-stone-500">
      {children}
    </span>
  );
}

function OrderRowActionsMenu({
  order,
  isDetailsOpen,
  onToggleDetails,
  onPatchOrder,
  onRequestCancel,
}: {
  order: AdminOrder;
  isDetailsOpen: boolean;
  onToggleDetails: () => void;
  onPatchOrder: (id: string, patch: Partial<AdminOrder>) => void;
  onRequestCancel: () => void;
}) {
  const { hasPermission } = useAuth();
  const canMarkPaid = hasPermission(PERMISSION.ADMIN_SALE_MARK_PAID);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const isInactive = isInactiveSale(order);
  const isPaid = Boolean(order.paidAt);
  const showCustomerLink = shouldOfferCustomerDataFillLink(order);
  const showPaymentLink =
    order.orderSource === "ADMIN_SALE" &&
    !isInactive &&
    orderHasUnpaidItems(order) &&
    !(order.paymentChannel === "MANUAL" && !order.paidAt);
  const showMarkPaid =
    canMarkPaid &&
    order.orderSource === "ADMIN_SALE" &&
    !isInactive &&
    ((!isPaid && order.status === "pending_payment") ||
      (isPaid && orderHasUnpaidItems(order)));
  const showConfirmPaymentCancelled =
    canMarkPaid && isInactive && !isPaid;
  const showReactivatePayment = gatewayMethodForCancelledSale(order) != null;
  const switchTarget = switchablePaymentMethod(order);
  const isPixPayment = order.paymentMethod === "pix";
  const isCardPayment = order.paymentMethod === "card";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  function toggleMenu() {
    if (open) {
      closeMenu();
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(
      8,
      Math.min(rect.right - ORDER_ACTION_MENU_WIDTH, window.innerWidth - ORDER_ACTION_MENU_WIDTH - 8)
    );
    setMenuPos({ top: rect.bottom + 6, left });
    setOpen(true);
  }

  async function handleMarkPaid() {
    const label = order.orderNumber != null ? `#${order.orderNumber}` : "esta venda";
    const confirmed = window.confirm(
      isPaid && orderHasUnpaidItems(order)
        ? `Confirmar pagamento das peças em aberto da venda ${label}? O acréscimo entra no caixa e a etiqueta pode ser gerada.`
        : `Marcar a venda ${label} como paga? Isso registra pagamento manual e libera o pedido para envio.`
    );
    if (!confirmed) return;
    setBusy("mark-paid");
    try {
      const res = await fetch(`/api/admin/sales/${order.id}/mark-paid`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        window.alert(data?.error ?? "Não foi possível marcar a venda como paga.");
        return;
      }
      onPatchOrder(order.id, manualMarkPaidOrderPatch(order));
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirmPaymentCancelled() {
    const label =
      order.orderNumber != null ? `#${order.orderNumber}` : "esta venda";
    const confirmed = window.confirm(
      `Confirmar pagamento da venda ${label}? A venda cancelada volta a ficar ativa e marcada como paga.`
    );
    if (!confirmed) return;
    setBusy("confirm-paid");
    try {
      const res = await fetch(`/api/admin/sales/${order.id}/mark-paid`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        window.alert(
          data?.error ?? "Não foi possível confirmar o pagamento."
        );
        return;
      }
      onPatchOrder(order.id, {
        paidAt: new Date().toISOString(),
        status: "paid",
        paymentChannel: "MANUAL",
        shippingStatus: "to_pack",
        cancellationReason: null,
        cancelledAt: null,
      });
    } finally {
      setBusy(null);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  async function handleCopyCustomerLink() {
    if (!order.customerDataToken) return;
    const url = `${window.location.origin}/venda-avulsa/completar/${order.customerDataToken}`;
    await copyText(buildCustomerDataShareMessage(order, url));
  }

  async function handleCopyPaymentLink() {
    const shareUrl = orderPaymentShareAbsoluteUrl(order);
    const isPix = isPixPayment || order.paymentShare?.type === "pix";
    const isCard = isCardPayment || order.paymentShare?.type === "card";

    try {
      if (shareUrl) {
        if (isPix) {
          await copyText(buildPixShareMessage(order, shareUrl, orderPayableAmount(order)));
          return;
        }
        if (isCard) {
          await copyText(buildCardShareMessage(order, shareUrl));
          return;
        }
      }

      // Fallback: regenera o link no servidor (ex.: tentativa InfinitePay ausente).
      setBusy("payment");
      const res = await fetch(`/api/admin/orders/${order.id}/payment-info`);
      const data = (await res.json()) as {
        type?: "pix" | "card" | "paid";
        paymentPath?: string;
        paymentToken?: string;
        checkoutUrl?: string;
        amount?: number;
        error?: string;
      };
      if (!res.ok) {
        window.alert(data.error ?? "Não foi possível carregar o pagamento.");
        return;
      }
      if (data.type === "paid") {
        window.alert("Pagamento já confirmado.");
        return;
      }
      if (data.type === "pix") {
        const path =
          data.paymentPath ??
          (data.paymentToken ? `/venda-avulsa/pagar/${data.paymentToken}` : null);
        if (!path) {
          window.alert("Não foi possível gerar o link Pix. Tente novamente.");
          return;
        }
        await copyText(
          buildPixShareMessage(
            order,
            `${window.location.origin}${path}`,
            data.amount ?? order.total
          )
        );
        return;
      }
      if (data.type === "card" && data.checkoutUrl) {
        onPatchOrder(order.id, {
          paymentShare: { type: "card", checkoutUrl: data.checkoutUrl },
        });
        await copyText(buildCardShareMessage(order, data.checkoutUrl));
        return;
      }
      window.alert("Link de pagamento indisponível. Atualize a lista e tente de novo.");
    } catch {
      window.alert("Não foi possível copiar. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRegenerateCardLink() {
    const label =
      order.orderNumber != null ? `#${order.orderNumber}` : "esta venda";
    const confirmed = window.confirm(
      `Gerar um novo link de cartão para ${label}? Envie o novo link à cliente — o anterior pode deixar de funcionar.`
    );
    if (!confirmed) return;

    setBusy("regen-card");
    try {
      const { ok, data } = await postPaymentInfo(order.id, { forceNew: true });
      if (!ok) {
        window.alert(data.error ?? "Não foi possível gerar um novo link.");
        return;
      }
      if (data.type === "paid") {
        window.alert("Pagamento já confirmado.");
        return;
      }
      if (data.type !== "card" || !data.checkoutUrl) {
        window.alert("Não foi possível gerar um novo link de cartão.");
        return;
      }
      onPatchOrder(order.id, {
        paymentShare: { type: "card", checkoutUrl: data.checkoutUrl },
      });
      await copyText(buildCardShareMessage(order, data.checkoutUrl));
    } catch {
      window.alert("Erro de conexão ao gerar o link.");
    } finally {
      setBusy(null);
    }
  }

  async function handleResumeCancelledSale() {
    const label =
      order.orderNumber != null ? `#${order.orderNumber}` : "esta venda";
    const method = gatewayMethodForCancelledSale(order);
    const confirmed = window.confirm(
      `Retomar a venda ${label}? Um novo link de ${method === "pix" ? "Pix" : "cartão"} será gerado e a venda terá 24 horas para pagamento.`
    );
    if (!confirmed) return;

    setBusy("resume");
    try {
      await resumeCancelledSaleAndCopy(order, onPatchOrder);
    } catch {
      window.alert("Erro de conexão ao retomar a venda.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSwitchPaymentMethod() {
    if (!switchTarget) return;
    const label =
      order.orderNumber != null ? `#${order.orderNumber}` : "esta venda";
    const targetLabel = switchTarget === "pix" ? "Pix" : "Cartão";
    const confirmed = window.confirm(
      `Trocar o pagamento da venda ${label} para ${targetLabel}? Um novo link será gerado.`
    );
    if (!confirmed) return;

    setBusy("switch-pay");
    try {
      await generatePaymentLinkAndCopy(
        order,
        switchTarget,
        onPatchOrder,
        "Não foi possível trocar o método de pagamento."
      );
    } catch {
      window.alert("Erro de conexão ao trocar o pagamento.");
    } finally {
      setBusy(null);
    }
  }

  type MenuAction = {
    id: string;
    label: string;
    icon: ReactNode;
    onClick: () => void | Promise<void>;
    disabled?: boolean;
    danger?: boolean;
    separatorBefore?: boolean;
  };

  const actions = useMemo(() => {
    const items: MenuAction[] = [];

    items.push({
      id: "details",
      label: isDetailsOpen ? "Fechar detalhes" : "Detalhes da venda",
      separatorBefore: items.length > 0,
      icon: (
        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
        </svg>
      ),
      onClick: onToggleDetails,
    });

    if (showCustomerLink) {
      items.push({
        id: "customer-link",
        label: "Copiar link de preenchimento de dados",
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.121a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
        ),
        onClick: () => void handleCopyCustomerLink(),
      });
    }

    if (showPaymentLink) {
      items.push({
        id: "payment-link",
        label:
          busy === "payment"
            ? "Copiando…"
            : isPixPayment
              ? "Copiar link Pix"
              : isCardPayment
                ? "Copiar link cartão"
                : "Copiar link de pagamento",
        disabled: busy === "payment" || busy === "regen-card",
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
          </svg>
        ),
        onClick: () => void handleCopyPaymentLink(),
      });

      if (isCardPayment && orderHasUnpaidItems(order)) {
        items.push({
          id: "regen-card",
          label:
            busy === "regen-card" ? "Gerando novo link…" : "Gerar novo link cartão",
          disabled: busy === "regen-card" || busy === "payment" || busy === "switch-pay",
          icon: (
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          ),
          onClick: () => void handleRegenerateCardLink(),
        });
      }
    }

    if (switchTarget) {
      items.push({
        id: "switch-pay",
        label:
          busy === "switch-pay"
            ? "Trocando pagamento…"
            : switchTarget === "pix"
              ? "Trocar pagamento para PIX"
              : "Trocar pagamento para Cartão",
        disabled: busy != null,
        separatorBefore: !showPaymentLink && items.length > 0,
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
        ),
        onClick: () => void handleSwitchPaymentMethod(),
      });
    }

    if (showReactivatePayment) {
      items.push({
        id: "resume",
        label: busy === "resume" ? "Retomando venda…" : "Retomar venda",
        disabled: busy != null,
        separatorBefore: items.length > 0,
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        ),
        onClick: () => void handleResumeCancelledSale(),
      });
    }

    if (showMarkPaid) {
      items.push({
        id: "mark-paid",
        label:
          busy === "mark-paid"
            ? "Marcando…"
            : isPaid && orderHasUnpaidItems(order)
              ? "Confirmar pagamento das peças em aberto"
              : "Marcar como paga",
        disabled: busy === "mark-paid",
        separatorBefore: items.length > 0,
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        ),
        onClick: () => void handleMarkPaid(),
      });
    }

    if (showConfirmPaymentCancelled) {
      items.push({
        id: "confirm-paid",
        label:
          busy === "confirm-paid" ? "Confirmando…" : "Confirmar pagamento",
        disabled: busy === "confirm-paid",
        separatorBefore: items.length > 0,
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        ),
        onClick: () => void handleConfirmPaymentCancelled(),
      });
    }

    if (!isInactive) {
      items.push({
        id: "cancel",
        label: "Cancelar",
        danger: true,
        separatorBefore: true,
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        ),
        onClick: onRequestCancel,
      });
    }

    return items;
  }, [
    busy,
    isInactive,
    isDetailsOpen,
    onRequestCancel,
    onToggleDetails,
    order.customerDataToken,
    order.paymentShare,
    order.paymentToken,
    order.status,
    order.total,
    showConfirmPaymentCancelled,
    showCustomerLink,
    showMarkPaid,
    showPaymentLink,
    showReactivatePayment,
    switchTarget,
    isPixPayment,
    isCardPayment,
  ]);

  return (
    <td className="px-3 py-3.5" onClick={(event) => event.stopPropagation()}>
      <div className="flex justify-center">
        <button
          ref={btnRef}
          type="button"
          aria-label="Ações do pedido"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={toggleMenu}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${open ? "bg-blue-50 text-blue-600" : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            }`}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="5" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="19" r="1.75" />
          </svg>
        </button>
      </div>

      {mounted && open && menuPos
        ? createPortal(
          <>
            <button
              type="button"
              aria-label="Fechar menu de ações"
              className="fixed inset-0 z-[90]"
              onClick={closeMenu}
            />
            <div
              role="menu"
              aria-label="Ações do pedido"
              className="fixed z-[91] overflow-hidden rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg"
              style={{ top: menuPos.top, left: menuPos.left, width: ORDER_ACTION_MENU_WIDTH }}
              onClick={(event) => event.stopPropagation()}
            >
              {actions.map((action) => (
                <div key={action.id}>
                  {action.separatorBefore ? (
                    <div className="my-1 border-t border-stone-100" role="separator" />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={action.disabled}
                    onClick={() => {
                      void action.onClick();
                      closeMenu();
                    }}
                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${action.danger
                        ? "text-red-600 hover:bg-red-50"
                        : "text-stone-700 hover:bg-stone-50"
                      }`}
                  >
                    <ActionMenuIcon>{action.icon}</ActionMenuIcon>
                    <span>{action.label}</span>
                  </button>
                </div>
              ))}
            </div>
          </>,
          document.body
        )
        : null}
    </td>
  );
}

/* ─── Detalhes do pedido (drawer) ─────────────────────────────────── */

function OrderProductsCards({
  order,
  products,
  ensureProducts,
  onRefresh,
}: {
  order: AdminOrder;
  products: Product[];
  ensureProducts: () => Promise<Product[]>;
  onRefresh: () => void;
}) {
  return (
    <OrderItemsEditor
      order={order}
      products={products}
      ensureProducts={ensureProducts}
      onRefresh={onRefresh}
    />
  );
}

function OrderDetailsBody({
  order,
  onRefresh,
  onPatchOrder,
  products,
  ensureProducts,
  openCancelForm = false,
  onCancelIntentHandled,
}: {
  order: AdminOrder;
  onRefresh: () => void;
  onPatchOrder: (id: string, patch: Partial<AdminOrder>) => void;
  products: Product[];
  ensureProducts: () => Promise<Product[]>;
  openCancelForm?: boolean;
  onCancelIntentHandled?: () => void;
}) {
  const { hasPermission } = useAuth();
  const canMarkPaid = hasPermission(PERMISSION.ADMIN_SALE_MARK_PAID);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerEditForm>(() =>
    customerEditFormFromOrder(order)
  );
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [cepLookupError, setCepLookupError] = useState<string | null>(null);
  const [editingDeliveryType, setEditingDeliveryType] = useState(false);
  const [savingDeliveryType, setSavingDeliveryType] = useState(false);
  const [deliveryTypeError, setDeliveryTypeError] = useState<string | null>(null);
  const [pickingCarrier, setPickingCarrier] = useState(false);
  const [quotingShipping, setQuotingShipping] = useState(false);
  const [shippingQuoteOptions, setShippingQuoteOptions] = useState<
    NormalizedShippingOption[]
  >([]);
  const [selectedShippingOptionId, setSelectedShippingOptionId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (openCancelForm) {
      setShowCancelForm(true);
      setCancelError(null);
    }
  }, [openCancelForm]);

  useEffect(() => {
    if (!editingCustomer) {
      setCustomerForm(customerEditFormFromOrder(order));
      setCustomerError(null);
      setCepLookupError(null);
    }
  }, [order, editingCustomer]);

  useEffect(() => {
    if (!editingCustomer) return;
    const digits = onlyDigits(customerForm.destinationCep, 8);
    if (digits.length !== 8) return;

    const timeout = setTimeout(() => {
      void (async () => {
        setCepLookupError(null);
        const result = await lookupAddressByCep(digits);
        if (!result.ok) {
          setCepLookupError(result.error);
          return;
        }
        setCustomerForm((current) => ({
          ...current,
          destinationCep: cepMask(digits),
          addressStreet: result.address.street || current.addressStreet,
          addressNeighborhood: result.address.neighborhood || current.addressNeighborhood,
          addressCity: result.address.city || current.addressCity,
          addressState: result.address.state || current.addressState,
        }));
      })();
    }, 400);

    return () => clearTimeout(timeout);
  }, [customerForm.destinationCep, editingCustomer]);

  const isCancelled = order.status === "cancelled";
  const hasActiveLabel = Boolean(order.labelUrl || order.superfreteShipmentId);

  async function cancelSale() {
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError("Informe o motivo do cancelamento.");
      return;
    }

    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = (await res.json()) as { error?: string; labelCancelled?: boolean };
      if (!res.ok) {
        setCancelError(data.error ?? "Erro ao cancelar venda.");
        return;
      }
      setShowCancelForm(false);
      setCancelReason("");
      onCancelIntentHandled?.();
      onPatchOrder(order.id, {
        status: "cancelled",
        cancellationReason: reason,
        cancelledAt: new Date().toISOString(),
        shippingStatus: "cancelled",
      });
    } catch {
      setCancelError("Erro de conexão.");
    } finally {
      setCancelling(false);
    }
  }

  async function markSalePaid() {
    const label = order.orderNumber != null ? `#${order.orderNumber}` : "esta venda";
    const isAddon = Boolean(order.paidAt) && orderHasUnpaidItems(order);
    const confirmed = window.confirm(
      isAddon
        ? `Confirmar pagamento das peças em aberto da venda ${label}? O acréscimo entra no caixa e a etiqueta pode ser gerada.`
        : `Marcar a venda ${label} como paga? Isso registra pagamento manual e libera o pedido para envio.`
    );
    if (!confirmed) return;

    setMarkingPaid(true);
    setMarkPaidError(null);
    try {
      const res = await fetch(`/api/admin/sales/${order.id}/mark-paid`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMarkPaidError(data?.error ?? "Não foi possível marcar a venda como paga.");
        return;
      }
      onPatchOrder(order.id, manualMarkPaidOrderPatch(order));
    } catch {
      setMarkPaidError("Erro de conexão.");
    } finally {
      setMarkingPaid(false);
    }
  }

  async function saveCustomerData() {
    const nextInternalNotes = customerForm.internalNotes.trim() || null;
    const nextDeliveryNotes = composeDeliveryNotesFromUserEdit(
      order.deliveryNotes,
      order.shippingServiceName,
      customerForm.deliveryNotes
    );
    const notesOnly =
      !isCustomerContactAddressComplete(customerFieldsForSave) &&
      customerNotesChanged;

    if (notesOnly) {
      setSavingCustomer(true);
      setCustomerError(null);
      try {
        const res = await fetch(`/api/admin/orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            internalNotes: nextInternalNotes,
            deliveryNotes: nextDeliveryNotes,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setCustomerError(data.error ?? "Erro ao salvar dados.");
          return;
        }
        setEditingCustomer(false);
        onPatchOrder(order.id, {
          internalNotes: nextInternalNotes,
          deliveryNotes: nextDeliveryNotes,
        });
      } catch {
        setCustomerError("Erro de conexão.");
      } finally {
        setSavingCustomer(false);
      }
      return;
    }

    if (!customerForm.recipientName.trim()) {
      setCustomerError("Informe o nome.");
      return;
    }
    if (customerForm.recipientName.trim().length > CUSTOMER_NAME_MAX_LENGTH) {
      setCustomerError(`Nome: no máximo ${CUSTOMER_NAME_MAX_LENGTH} caracteres.`);
      return;
    }
    if (onlyDigits(customerForm.phone).length < 10) {
      setCustomerError("Informe um telefone válido.");
      return;
    }
    const cpfError = cpfValidationError(customerForm.cpf);
    if (cpfError) {
      setCustomerError(cpfError);
      return;
    }
    if (onlyDigits(customerForm.destinationCep, 8).length !== 8) {
      setCustomerError("Informe um CEP válido.");
      return;
    }
    if (!customerForm.addressStreet.trim()) {
      setCustomerError("Informe a rua.");
      return;
    }
    if (!customerForm.addressNumber.trim()) {
      setCustomerError("Informe o número.");
      return;
    }
    if (customerForm.addressNumber.trim().length > ADDRESS_NUMBER_MAX_LENGTH) {
      setCustomerError(`Número: no máximo ${ADDRESS_NUMBER_MAX_LENGTH} caracteres.`);
      return;
    }
    if (
      customerForm.addressComplement.trim().length > ADDRESS_COMPLEMENT_MAX_LENGTH
    ) {
      setCustomerError(
        `Complemento: no máximo ${ADDRESS_COMPLEMENT_MAX_LENGTH} caracteres.`
      );
      return;
    }
    if (!customerForm.addressNeighborhood.trim()) {
      setCustomerError("Informe o bairro.");
      return;
    }
    if (!customerForm.addressCity.trim()) {
      setCustomerError("Informe a cidade.");
      return;
    }
    if (customerForm.addressState.trim().length !== 2) {
      setCustomerError("Informe a UF.");
      return;
    }
    const email = customerForm.email.trim();
    if (!email) {
      setCustomerError("Informe o e-mail do cliente.");
      return;
    }
    if (!email.includes("@") || !email.includes(".")) {
      setCustomerError("Informe um e-mail válido.");
      return;
    }

    setSavingCustomer(true);
    setCustomerError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: customerForm.recipientName,
          email,
          phone: customerForm.phone,
          cpf: customerForm.cpf,
          destinationCep: customerForm.destinationCep,
          addressStreet: customerForm.addressStreet,
          addressNumber: customerForm.addressNumber,
          addressComplement: customerForm.addressComplement,
          addressNeighborhood: customerForm.addressNeighborhood,
          addressCity: customerForm.addressCity,
          addressState: customerForm.addressState,
          internalNotes: nextInternalNotes,
          deliveryNotes: nextDeliveryNotes,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setCustomerError(data.error ?? "Erro ao salvar dados.");
        return;
      }
      setEditingCustomer(false);
      onPatchOrder(order.id, {
        recipientName: customerForm.recipientName.trim(),
        email: email || order.email,
        phone: customerForm.phone.trim(),
        cpf: customerForm.cpf.trim() || null,
        destinationCep: customerForm.destinationCep.replace(/\D/g, "") || null,
        addressStreet: customerForm.addressStreet.trim() || null,
        addressNumber: customerForm.addressNumber.trim() || null,
        addressComplement: customerForm.addressComplement.trim() || null,
        addressNeighborhood: customerForm.addressNeighborhood.trim() || null,
        addressCity: customerForm.addressCity.trim() || null,
        addressState: customerForm.addressState.trim().toUpperCase() || null,
        internalNotes: nextInternalNotes,
        deliveryNotes: nextDeliveryNotes,
        customerDataStatus: "COMPLETE",
      });
    } catch {
      setCustomerError("Erro de conexão.");
    } finally {
      setSavingCustomer(false);
    }
  }

  const customerFieldsForSave = {
    name: customerForm.recipientName,
    email: customerForm.email,
    phone: customerForm.phone,
    cpf: customerForm.cpf,
    destinationCep: customerForm.destinationCep,
    street: customerForm.addressStreet,
    number: customerForm.addressNumber,
    complement: customerForm.addressComplement,
    neighborhood: customerForm.addressNeighborhood,
    city: customerForm.addressCity,
    state: customerForm.addressState,
  };
  const originalInternalNotes = (order.internalNotes ?? "").trim();
  const originalDeliveryNotes = (saleDeliveryUserNotes(order) ?? "").trim();
  const customerNotesChanged =
    customerForm.internalNotes.trim() !== originalInternalNotes ||
    customerForm.deliveryNotes.trim() !== originalDeliveryNotes;
  const canSaveCustomer =
    isCustomerContactAddressComplete(customerFieldsForSave) ||
    customerNotesChanged;
  const customerSaveHint = isCustomerContactAddressComplete(
    customerFieldsForSave
  )
    ? null
    : customerNotesChanged
      ? "As observações serão salvas e o link de preenchimento da cliente continua ativo."
      : customerContactAddressValidationError(customerFieldsForSave);

  const customerName = orderCustomerName(order);
  const customerPhone = order.phone || order.user?.phone || null;
  const customerEmail = orderCustomerDisplayEmail(order);
  const customerCpf = order.cpf;

  const pb = payBadge(order);
  const itemsSubtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingMethod = shortShippingMethod(
    order.shippingServiceName,
    order.fulfillmentType,
    order.deliveryNotes
  );
  const arrangedDelivery =
    order.fulfillmentType === "ARRANGED"
      ? resolveArrangedDeliveryDisplay({
        shippingServiceName: order.shippingServiceName,
        deliveryNotes: order.deliveryNotes,
        shippingAmount: order.shippingAmount,
      })
      : null;
  const deliveryUserNotes = saleDeliveryUserNotes(order);
  const addressBlock = formatOrderAddressBlock(order);
  const showCustomerLink = shouldOfferCustomerDataFillLink(order);
  const canReactivatePayment = gatewayMethodForCancelledSale(order) != null;
  const canSwitchPayment = switchablePaymentMethod(order) != null;
  const showPaymentLink =
    order.orderSource === "ADMIN_SALE" &&
    !isInactiveSale(order) &&
    orderHasUnpaidItems(order) &&
    !(order.paymentChannel === "MANUAL" && !order.paidAt);
  const hasAdminLinks =
    showCustomerLink || showPaymentLink || canReactivatePayment || canSwitchPayment;
  const shippingStatusInfo = sInfo(order.shippingStatus);
  const currentArrangedMode = parseArrangedDeliveryMode({
    shippingServiceName: order.shippingServiceName,
    deliveryNotes: order.deliveryNotes,
  });
  const canEditDeliveryType =
    order.orderSource === "ADMIN_SALE" &&
    !isInactiveSale(order) &&
    !order.labelUrl &&
    !order.superfreteShipmentId &&
    order.shippingStatus !== "shipped" &&
    order.shippingStatus !== "delivered";
  const showDeliveryTypePicker = canEditDeliveryType && editingDeliveryType;
  const isCarrierDelivery = order.fulfillmentType === "CARRIER";

  function resetDeliveryEditor() {
    setEditingDeliveryType(false);
    setPickingCarrier(false);
    setShippingQuoteOptions([]);
    setSelectedShippingOptionId(null);
    setDeliveryTypeError(null);
  }

  async function saveArrangedDelivery(arrangedMode: ArrangedDeliveryMode) {
    setSavingDeliveryType(true);
    setDeliveryTypeError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/shipping`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arrangedMode }),
      });
      const data = (await res.json()) as {
        error?: string;
        fulfillmentType?: string;
        shippingServiceName?: string | null;
        shippingAmount?: number;
        total?: number;
        deliveryNotes?: string | null;
      };
      if (!res.ok) {
        setDeliveryTypeError(data.error ?? "Não foi possível atualizar o tipo de entrega.");
        return;
      }
      onPatchOrder(order.id, {
        fulfillmentType: data.fulfillmentType ?? "ARRANGED",
        shippingServiceName: data.shippingServiceName ?? null,
        shippingAmount: data.shippingAmount ?? 0,
        total: data.total ?? order.total,
        deliveryNotes: data.deliveryNotes ?? null,
        shippingProvider: null,
      });
      resetDeliveryEditor();
    } catch {
      setDeliveryTypeError("Erro de conexão.");
    } finally {
      setSavingDeliveryType(false);
    }
  }

  async function loadCarrierQuotes() {
    const cep = onlyDigits(order.destinationCep ?? "", 8);
    if (cep.length !== 8) {
      setDeliveryTypeError(
        "Preencha o CEP da cliente em Dados pessoais antes de escolher o envio."
      );
      setPickingCarrier(true);
      setShippingQuoteOptions([]);
      return;
    }
    setPickingCarrier(true);
    setQuotingShipping(true);
    setDeliveryTypeError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/shipping/quote`);
      const data = (await res.json()) as {
        error?: string;
        options?: NormalizedShippingOption[];
      };
      if (!res.ok) {
        setDeliveryTypeError(data.error ?? "Não foi possível cotar o frete.");
        setShippingQuoteOptions([]);
        return;
      }
      const options = data.options ?? [];
      setShippingQuoteOptions(options);
      setSelectedShippingOptionId(options[0]?.id ?? null);
    } catch {
      setDeliveryTypeError("Erro de conexão.");
      setShippingQuoteOptions([]);
    } finally {
      setQuotingShipping(false);
    }
  }

  async function saveCarrierDelivery() {
    if (!selectedShippingOptionId) {
      setDeliveryTypeError("Selecione uma opção de frete.");
      return;
    }
    setSavingDeliveryType(true);
    setDeliveryTypeError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/shipping`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId: selectedShippingOptionId }),
      });
      const data = (await res.json()) as {
        error?: string;
        fulfillmentType?: string;
        shippingServiceName?: string | null;
        shippingAmount?: number;
        total?: number;
        shippingProvider?: string | null;
      };
      if (!res.ok) {
        setDeliveryTypeError(data.error ?? "Não foi possível salvar o envio.");
        return;
      }
      onPatchOrder(order.id, {
        fulfillmentType: data.fulfillmentType ?? "CARRIER",
        shippingServiceName: data.shippingServiceName ?? null,
        shippingAmount: data.shippingAmount ?? order.shippingAmount,
        total: data.total ?? order.total,
        shippingProvider: data.shippingProvider ?? order.shippingProvider,
      });
      resetDeliveryEditor();
    } catch {
      setDeliveryTypeError("Erro de conexão.");
    } finally {
      setSavingDeliveryType(false);
    }
  }

  return (
    <div className="space-y-4">
      <ExpandedSection title="Produtos">
        <OrderProductsCards
          order={order}
          products={products}
          ensureProducts={ensureProducts}
          onRefresh={onRefresh}
        />
      </ExpandedSection>

      <ExpandedSection
        title="Dados pessoais"
        headerAction={
          !editingCustomer ? (
            <button
              type="button"
              onClick={() => {
                setCustomerForm(customerEditFormFromOrder(order));
                setEditingCustomer(true);
                setCustomerError(null);
                setCepLookupError(null);
              }}
              aria-label="Editar dados pessoais"
              className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            >
              <PencilIcon />
            </button>
          ) : null
        }
      >
        {editingCustomer ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <EditField label="Nome">
                <EditInput
                  maxLength={CUSTOMER_NAME_MAX_LENGTH}
                  value={customerForm.recipientName}
                  onChange={(e) =>
                    setCustomerForm((f) => ({
                      ...f,
                      recipientName: e.target.value.slice(
                        0,
                        CUSTOMER_NAME_MAX_LENGTH
                      ),
                    }))
                  }
                />
                <p className="mt-1 text-[10px] text-stone-400">
                  Máx. {CUSTOMER_NAME_MAX_LENGTH} caracteres
                </p>
              </EditField>
              <EditField label="E-mail">
                <EditInput
                  type="email"
                  required
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm((f) => ({ ...f, email: e.target.value }))}
                />
              </EditField>
              <EditField label="Telefone">
                <EditInput
                  inputMode="tel"
                  value={customerForm.phone}
                  onChange={(e) =>
                    setCustomerForm((f) => ({ ...f, phone: phoneFmt(e.target.value) }))
                  }
                />
              </EditField>
              <EditField label="CPF">
                <EditInput
                  inputMode="numeric"
                  value={customerForm.cpf}
                  onChange={(e) =>
                    setCustomerForm((f) => ({ ...f, cpf: cpfFmt(e.target.value) }))
                  }
                />
              </EditField>
            </div>

            <div className="border-t border-stone-100 pt-4">
              <p className="mb-3 text-xs font-medium text-stone-500">Endereço de entrega</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <EditField label="CEP">
                  <EditInput
                    inputMode="numeric"
                    value={customerForm.destinationCep}
                    onChange={(e) =>
                      setCustomerForm((f) => ({
                        ...f,
                        destinationCep: cepMask(onlyDigits(e.target.value, 8)),
                      }))
                    }
                  />
                  {cepLookupError ? (
                    <p className="mt-1 text-xs text-amber-700">{cepLookupError}</p>
                  ) : null}
                </EditField>
                <div className="sm:col-span-2">
                  <EditField label="Rua">
                    <EditInput
                      value={customerForm.addressStreet}
                      onChange={(e) =>
                        setCustomerForm((f) => ({ ...f, addressStreet: e.target.value }))
                      }
                    />
                  </EditField>
                </div>
                <EditField label="Número">
                  <EditInput
                    maxLength={ADDRESS_NUMBER_MAX_LENGTH}
                    value={customerForm.addressNumber}
                    onChange={(e) =>
                      setCustomerForm((f) => ({
                        ...f,
                        addressNumber: e.target.value.slice(
                          0,
                          ADDRESS_NUMBER_MAX_LENGTH
                        ),
                      }))
                    }
                  />
                  <p className="mt-1 text-[10px] text-stone-400">
                    Máx. {ADDRESS_NUMBER_MAX_LENGTH} caracteres
                  </p>
                </EditField>
                <EditField label="Complemento" optional>
                  <EditInput
                    maxLength={ADDRESS_COMPLEMENT_MAX_LENGTH}
                    value={customerForm.addressComplement}
                    onChange={(e) =>
                      setCustomerForm((f) => ({
                        ...f,
                        addressComplement: e.target.value.slice(
                          0,
                          ADDRESS_COMPLEMENT_MAX_LENGTH
                        ),
                      }))
                    }
                  />
                  <p className="mt-1 text-[10px] text-stone-400">
                    Máx. {ADDRESS_COMPLEMENT_MAX_LENGTH} caracteres
                  </p>
                </EditField>
                <EditField label="Bairro">
                  <EditInput
                    value={customerForm.addressNeighborhood}
                    onChange={(e) =>
                      setCustomerForm((f) => ({ ...f, addressNeighborhood: e.target.value }))
                    }
                  />
                </EditField>
                <EditField label="Cidade">
                  <EditInput
                    value={customerForm.addressCity}
                    onChange={(e) =>
                      setCustomerForm((f) => ({ ...f, addressCity: e.target.value }))
                    }
                  />
                </EditField>
                <EditField label="UF">
                  <EditInput
                    maxLength={2}
                    value={customerForm.addressState}
                    onChange={(e) =>
                      setCustomerForm((f) => ({
                        ...f,
                        addressState: e.target.value.toUpperCase().slice(0, 2),
                      }))
                    }
                  />
                </EditField>
              </div>
            </div>

            <div className="space-y-3 border-t border-stone-100 pt-4">
              <EditField label="Obs. internas" optional>
                <EditTextarea
                  rows={3}
                  value={customerForm.internalNotes}
                  onChange={(e) =>
                    setCustomerForm((f) => ({
                      ...f,
                      internalNotes: e.target.value,
                    }))
                  }
                  placeholder="Visível só para a equipe…"
                />
              </EditField>
              <EditField label="Obs. entrega" optional>
                <EditTextarea
                  rows={3}
                  value={customerForm.deliveryNotes}
                  onChange={(e) =>
                    setCustomerForm((f) => ({
                      ...f,
                      deliveryNotes: e.target.value,
                    }))
                  }
                  placeholder="Ex.: entregar após 18h, interfone…"
                />
              </EditField>
            </div>

            {customerError ? (
              <p className="text-xs text-red-600">{customerError}</p>
            ) : customerSaveHint ? (
              <p
                className={`text-xs ${
                  customerNotesChanged ? "text-stone-500" : "text-amber-700"
                }`}
              >
                {customerSaveHint}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={savingCustomer || !canSaveCustomer}
                onClick={() => void saveCustomerData()}
                className="flex-1 rounded-lg bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingCustomer ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="button"
                disabled={savingCustomer}
                onClick={() => {
                  setEditingCustomer(false);
                  setCustomerError(null);
                  setCepLookupError(null);
                }}
                className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-semibold text-stone-600">
                {customerInitials(customerName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-900">{customerName}</p>
                {customerEmail ? (
                  <p className="mt-1 text-sm text-stone-600">{customerEmail}</p>
                ) : null}
                {customerPhone ? <p className="text-sm text-stone-600">{customerPhone}</p> : null}
                {customerCpf ? (
                  <p className="mt-1 text-xs text-stone-500">CPF {cpfDisplay(customerCpf)}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 border-t border-stone-100 pt-4">
              <p className="mb-2 text-xs font-medium text-stone-500">Endereço de entrega</p>
              {addressBlock ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-stone-700">
                  {addressBlock}
                </p>
              ) : (
                <p className="text-sm text-stone-400">Não informado</p>
              )}
              {canEditDeliveryType && showDeliveryTypePicker ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-stone-500">Tipo de entrega</p>
                  <div className="space-y-1.5">
                    {ARRANGED_DELIVERY_OPTIONS.map((option) => (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          !pickingCarrier && currentArrangedMode === option.id
                            ? "border-sky-300 bg-sky-50"
                            : "border-stone-200 hover:border-stone-300"
                        } ${savingDeliveryType ? "pointer-events-none opacity-60" : ""}`}
                      >
                        <input
                          type="radio"
                          name={`delivery-type-${order.id}`}
                          className="mt-0.5 accent-sky-600"
                          checked={!pickingCarrier && currentArrangedMode === option.id}
                          disabled={savingDeliveryType || quotingShipping}
                          onChange={() => {
                            setPickingCarrier(false);
                            setShippingQuoteOptions([]);
                            void saveArrangedDelivery(option.id);
                          }}
                        />
                        <span>
                          <span className="font-medium text-stone-800">
                            {ARRANGED_DELIVERY_LABELS[option.id]}
                          </span>
                          {option.hint ? (
                            <span className="block text-xs text-stone-500">{option.hint}</span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                    <label
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        pickingCarrier || (!currentArrangedMode && isCarrierDelivery)
                          ? "border-sky-300 bg-sky-50"
                          : "border-stone-200 hover:border-stone-300"
                      } ${savingDeliveryType ? "pointer-events-none opacity-60" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`delivery-type-${order.id}`}
                        className="mt-0.5 accent-sky-600"
                        checked={pickingCarrier || (!currentArrangedMode && isCarrierDelivery)}
                        disabled={savingDeliveryType || quotingShipping}
                        onChange={() => void loadCarrierQuotes()}
                      />
                      <span>
                        <span className="font-medium text-stone-800">Envio</span>
                        <span className="block text-xs text-stone-500">
                          Transportadora com valor de frete
                        </span>
                      </span>
                    </label>
                  </div>
                  {pickingCarrier ? (
                    <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
                      {quotingShipping ? (
                        <p className="text-xs text-stone-500">Consultando opções de frete…</p>
                      ) : shippingQuoteOptions.length > 0 ? (
                        <ul className="space-y-1.5">
                          {shippingQuoteOptions.map((opt) => (
                            <li key={opt.id}>
                              <label
                                className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm ${
                                  selectedShippingOptionId === opt.id
                                    ? "border-sky-300"
                                    : "border-stone-200"
                                }`}
                              >
                                <span className="flex min-w-0 items-start gap-2">
                                  <input
                                    type="radio"
                                    name={`carrier-option-${order.id}`}
                                    className="mt-0.5 accent-sky-600"
                                    checked={selectedShippingOptionId === opt.id}
                                    onChange={() => setSelectedShippingOptionId(opt.id)}
                                  />
                                  <span>
                                    <span className="font-medium text-stone-800">
                                      {opt.carrierName} — {opt.serviceName}
                                    </span>
                                    <span className="block text-xs text-stone-500">
                                      {formatDeliveryDaysLabel(
                                        opt.deliveryDaysMin,
                                        opt.deliveryDaysMax
                                      )}
                                    </span>
                                  </span>
                                </span>
                                <span className="shrink-0 font-semibold tabular-nums text-stone-900">
                                  {formatPrice(opt.price)}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-stone-500">
                          Nenhuma opção de frete disponível para este CEP.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={
                          savingDeliveryType ||
                          quotingShipping ||
                          !selectedShippingOptionId
                        }
                        onClick={() => void saveCarrierDelivery()}
                        className="w-full rounded-lg bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                      >
                        {savingDeliveryType ? "Salvando…" : "Confirmar envio"}
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={savingDeliveryType}
                    onClick={() => resetDeliveryEditor()}
                    className="text-xs font-medium text-stone-500 hover:text-stone-800 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  {deliveryTypeError ? (
                    <p className="text-xs text-red-600">{deliveryTypeError}</p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 flex items-start justify-between gap-2">
                  {arrangedDelivery ? (
                    <p className="text-xs text-stone-500">
                      {arrangedDelivery.typeLabel}
                      {arrangedDelivery.showPrice
                        ? ` · ${order.shippingAmount > 0 ? formatPrice(order.shippingAmount) : "Grátis"}`
                        : arrangedDelivery.typeLabel === "Entregador da loja" ||
                            arrangedDelivery.typeLabel === "Uber"
                          ? " · A combinar"
                          : null}
                    </p>
                  ) : shippingMethod ? (
                    <p className="text-xs text-stone-500">
                      {shippingMethod}
                      {" · "}
                      {order.shippingAmount > 0
                        ? formatPrice(order.shippingAmount)
                        : "Frete grátis"}
                    </p>
                  ) : (
                    <p className="text-xs text-stone-400">Tipo de entrega não definido</p>
                  )}
                  {canEditDeliveryType ? (
                    <button
                      type="button"
                      disabled={savingDeliveryType}
                      onClick={() => {
                        setDeliveryTypeError(null);
                        setPickingCarrier(isCarrierDelivery);
                        setEditingDeliveryType(true);
                        if (order.fulfillmentType === "CARRIER") {
                          void loadCarrierQuotes();
                        }
                      }}
                      className="shrink-0 text-xs font-medium text-stone-500 hover:text-stone-800 disabled:opacity-50"
                    >
                      Alterar
                    </button>
                  ) : null}
                </div>
              )}
              {canEditDeliveryType && !showDeliveryTypePicker && deliveryTypeError ? (
                <p className="mt-1 text-xs text-red-600">{deliveryTypeError}</p>
              ) : null}
            </div>

            {(order.internalNotes?.trim() || deliveryUserNotes) ? (
              <div className="mt-4 space-y-2 border-t border-stone-100 pt-4 text-sm text-stone-600">
                {order.internalNotes?.trim() ? (
                  <p>
                    <span className="font-medium text-stone-800">Obs. internas:</span>{" "}
                    {order.internalNotes}
                  </p>
                ) : null}
                {deliveryUserNotes ? (
                  <p>
                    <span className="font-medium text-stone-800">Obs. entrega:</span>{" "}
                    {deliveryUserNotes}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </ExpandedSection>

      <ExpandedSection title="Pagamento">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="text-sm text-stone-500">Status</span>
          <PaymentStatusBadge label={pb.label} cls={pb.cls} />
        </div>
        <dl className="space-y-2 text-sm">
          <DetailRow label="Método" value={paymentMethodLabel(order.paymentCaptureMethod)} />
          {order.paidAt ? <DetailRow label="Pago em" value={fmtFull(order.paidAt)} /> : null}
        </dl>
        <div className="my-4 border-t border-stone-100" />
        <div className="space-y-1.5 rounded-lg bg-stone-50 p-3">
          <ReceiptLine label="Subtotal" value={formatPrice(itemsSubtotal)} />
          {(order.itemsDiscountTotal ?? 0) > 0 ? (
            <ReceiptLine label="Desc. itens" value={`-${formatPrice(order.itemsDiscountTotal!)}`} />
          ) : null}
          <ReceiptLine
            label="Frete"
            value={shippingFeeDisplayText(
              resolveShippingFeeDisplay({
                shippingServiceName: order.shippingServiceName,
                deliveryNotes: order.deliveryNotes,
                shippingAmount: order.shippingAmount,
              }),
              formatPrice
            )}
          />
          {(order.orderDiscountAmount ?? 0) > 0 ? (
            <ReceiptLine label="Desc. geral" value={`-${formatPrice(order.orderDiscountAmount!)}`} />
          ) : null}
          <div className="border-t border-stone-200 pt-2">
            <ReceiptLine label="Total" value={formatPrice(order.total)} bold />
          </div>
          {(order.paidTotal ?? 0) > 0 && orderHasUnpaidItems(order) ? (
            <>
              <ReceiptLine label="Já pago" value={formatPrice(order.paidTotal ?? 0)} />
              <ReceiptLine
                label="A pagar"
                value={formatPrice(orderPayableAmount(order))}
                bold
              />
            </>
          ) : null}
        </div>
        {isCancelled && order.cancelledAt ? (
          <p className="mt-3 text-xs text-stone-500">Cancelado em {fmtFull(order.cancelledAt)}</p>
        ) : null}
        {isCancelled && order.cancellationReason ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            <span className="font-medium">Motivo:</span> {order.cancellationReason}
          </p>
        ) : null}
      </ExpandedSection>

      {!isCancelled ? (
        <ExpandedSection title="Ações">
          <div className="space-y-3">
            {order.paidAt ? (
              <>
                <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
                  <p className="mb-1.5 text-xs font-medium text-stone-500">Status do envio</p>
                  <ShippingStatusBadge
                    label={tableShippingLabel(order.shippingStatus)}
                    tone={shippingStatusInfo.tone}
                    status={order.shippingStatus}
                  />
                  <p className="mt-1.5 text-xs text-stone-500">
                    {orderHasUnpaidItems(order)
                      ? "Há peças aguardando pagamento. A etiqueta só pode ser gerada quando todas estiverem pagas."
                      : "Embalagem e etiqueta são gerenciadas em Envios."}
                  </p>
                </div>
                {order.trackingCode ? (
                  <p className="text-xs text-stone-500">
                    Rastreio: <span className="font-mono text-stone-700">{order.trackingCode}</span>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-stone-500">
                Status de envio disponível após o pagamento.
              </p>
            )}

            {canMarkPaid &&
            order.orderSource === "ADMIN_SALE" &&
            ((!order.paidAt && order.status === "pending_payment") ||
              (Boolean(order.paidAt) && orderHasUnpaidItems(order))) ? (
              <div className="space-y-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  disabled={markingPaid}
                  onClick={() => void markSalePaid()}
                  className="flex w-full items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                >
                  {markingPaid
                    ? "Marcando…"
                    : order.paidAt
                      ? "Confirmar pagamento das peças em aberto"
                      : "Marcar como paga"}
                </button>
                {markPaidError ? (
                  <p className="text-xs text-red-600">{markPaidError}</p>
                ) : null}
              </div>
            ) : null}

            {showCancelForm ? (
              <div className="space-y-2 border-t border-stone-100 pt-3">
                <textarea
                  id={`cancel-reason-${order.id}`}
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Motivo do cancelamento…"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                />
                {hasActiveLabel ? (
                  <p className="text-xs text-stone-500">
                    A etiqueta será cancelada no{" "}
                    {order.shippingProvider === "MELHOR_ENVIO"
                      ? "Melhor Envio"
                      : "SuperFrete"}
                    .
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => void cancelSale()}
                    className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelling ? "Cancelando…" : "Confirmar"}
                  </button>
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => {
                      setShowCancelForm(false);
                      setCancelReason("");
                      setCancelError(null);
                      onCancelIntentHandled?.();
                    }}
                    className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50"
                  >
                    Voltar
                  </button>
                </div>
                {cancelError ? <p className="text-xs text-red-600">{cancelError}</p> : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowCancelForm(true);
                  setCancelError(null);
                }}
                className="flex w-full items-center justify-center rounded-lg border border-red-200 bg-red-50 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                Cancelar venda
              </button>
            )}
          </div>
        </ExpandedSection>
      ) : null}

      {hasAdminLinks ? (
        <ExpandedSection title="Links">
          <AdminSaleLinks order={order} onPatchOrder={onPatchOrder} />
        </ExpandedSection>
      ) : null}
    </div>
  );
}


function SaleOrderDrawer({
  order,
  open,
  onClose,
  onRefresh,
  onPatchOrder,
  products,
  ensureProducts,
  openCancelForm = false,
  onCancelIntentHandled,
}: {
  order: AdminOrder | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onPatchOrder: (id: string, patch: Partial<AdminOrder>) => void;
  products: Product[];
  ensureProducts: () => Promise<Product[]>;
  openCancelForm?: boolean;
  onCancelIntentHandled?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [displayOrder, setDisplayOrder] = useState<AdminOrder | null>(null);

  const patchDisplayOrder: typeof onPatchOrder = (id, patch) => {
    setDisplayOrder((current) =>
      current && current.id === id ? { ...current, ...patch } : current
    );
    onPatchOrder(id, patch);
  };

  useEffect(() => {
    if (open && order) {
      setDisplayOrder(order);
    }
  }, [open, order]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      const t = window.setTimeout(() => {
        setMounted(false);
        setDisplayOrder(null);
      }, DETAILS_DRAWER_MS);
      return () => clearTimeout(t);
    }

    setMounted(true);
    setEntered(false);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted || !displayOrder) return null;

  const title = `Pedido #${displayOrder.orderNumber ?? "—"}`;
  const isSaleCancelled = displayOrder.status === "cancelled";

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ease-out motion-reduce:transition-none ${entered ? "opacity-100" : "opacity-0"
          }`}
        aria-label="Fechar detalhes do pedido"
        onClick={onClose}
      />
      <aside
        className={`absolute top-0 right-0 flex h-full w-full max-w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none sm:max-w-md sm:border-l sm:border-stone-200 ${entered ? "translate-x-0" : "translate-x-full"
          }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-order-drawer-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-4 py-4">
          <div className="min-w-0">
            <h2 id="sale-order-drawer-title" className="text-lg font-semibold text-stone-900">
              {title}
            </h2>
            {isSaleCancelled ? (
              <p className="mt-0.5 text-xs font-medium text-red-600">Cancelado</p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label="Fechar"
            onClick={onClose}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <OrderDetailsBody
            order={displayOrder}
            onRefresh={onRefresh}
            onPatchOrder={patchDisplayOrder}
            products={products}
            ensureProducts={ensureProducts}
            openCancelForm={openCancelForm}
            onCancelIntentHandled={onCancelIntentHandled}
          />
        </div>
      </aside>
    </div>,
    document.body
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-stone-500">{label}</dt>
      <dd className="text-right text-stone-800 break-all">{value}</dd>
    </div>
  );
}

/* ─── Componente principal ────────────────────────────────────────── */

export function SalesManager() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [originFilter, setOriginFilter] = useState<string | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [saleDateRange, setSaleDateRange] = useState<SaleDateRange>(
    EMPTY_SALE_DATE_RANGE
  );
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [cancelFormOrderId, setCancelFormOrderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  const fetchProducts = useCallback(async (): Promise<Product[]> => {
    const res = await fetch("/api/products");
    const data = await res.json();
    const list = Array.isArray(data) ? (data as Product[]) : [];
    setProducts(list);
    return list;
  }, []);

  const ensureProducts = useCallback(async (): Promise<Product[]> => {
    if (products.length > 0) return products;
    return fetchProducts();
  }, [products, fetchProducts]);

  useEffect(() => {
    if (showWizard && products.length === 0) void fetchProducts();
  }, [showWizard, products.length, fetchProducts]);
  const allRef = useRef<HTMLInputElement>(null);

  const fetchOrders = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setSelectedIds(new Set());
    }
    try {
      const res = await fetch("/api/admin/orders");
      const data = (await res.json()) as ApiResponse;
      setOrders(data.orders ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const patchOrder = useCallback((id: string, patch: Partial<AdminOrder>) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === id ? { ...order, ...patch } : order))
    );
  }, []);

  const softRefresh = useCallback(() => {
    void fetchOrders({ silent: true });
  }, [fetchOrders]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const filterCounts = useMemo(
    () => ({
      paid: orders.filter(
        (order) => !isInactiveSale(order) && order.paidAt
      ).length,
      waiting: orders.filter(
        (order) => !isInactiveSale(order) && !order.paidAt
      ).length,
      to_pack: orders.filter(
        (order) =>
          !isInactiveSale(order) &&
          order.paidAt &&
          order.shippingStatus === "to_pack"
      ).length,
      cancelled: orders.filter((order) => isInactiveSale(order)).length,
    }),
    [orders]
  );

  const originFilterOptions = useMemo(
    () => collectOriginFilterOptions(orders),
    [orders]
  );

  useEffect(() => {
    if (originFilter && !originFilterOptions.includes(originFilter)) {
      setOriginFilter(null);
    }
  }, [originFilter, originFilterOptions]);

  const visibleOrders = useMemo(() => {
    const query = customerSearchQuery.trim();

    return orders.filter((order) => {
      if (!orderMatchesStatusFilter(order, filter)) return false;
      if (!orderMatchesSaleDateRange(order, saleDateRange)) return false;
      if (!orderMatchesOriginFilter(order, originFilter)) return false;
      return orderMatchesCustomerSearch(order, query);
    });
  }, [orders, filter, customerSearchQuery, saleDateRange, originFilter]);

  function toggleFilter(key: FilterKey) {
    setFilter((current) => (current === key ? null : key));
  }

  useEffect(() => {
    if (!allRef.current) return;
    const n = selectedIds.size;
    allRef.current.indeterminate = n > 0 && n < visibleOrders.length;
    allRef.current.checked = n === visibleOrders.length && visibleOrders.length > 0;
  }, [selectedIds, visibleOrders.length]);

  const openDetails = (id: string) => setDetailsOrderId(id);

  const closeDetails = () => {
    setDetailsOrderId(null);
    setCancelFormOrderId((current) =>
      current === detailsOrderId ? null : current
    );
  };

  const toggleDetails = (id: string) => {
    if (detailsOrderId === id) {
      closeDetails();
    } else {
      openDetails(id);
    }
  };

  function requestCancel(orderId: string) {
    setDetailsOrderId(orderId);
    setCancelFormOrderId(orderId);
  }
  const toggleSelect = (id: string) =>
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelectedIds(
      selectedIds.size === visibleOrders.length
        ? new Set()
        : new Set(visibleOrders.map((o) => o.id))
    );

  async function bulkShipping(status: string, label: string) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkLoading(true); setBulkMsg(null);
    try {
      await Promise.all(ids.map((id) =>
        fetch(`/api/admin/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shippingStatus: status }),
        })
      ));
      setBulkMsg(`${ids.length} pedido(s) marcado(s) como "${label}".`);
      await fetchOrders();
    } finally { setBulkLoading(false); }
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "paid", label: "Pagas" },
    { key: "waiting", label: "Aguardando pagamento" },
    { key: "to_pack", label: "Por embalar" },
    { key: "cancelled", label: "Canceladas" },
  ];

  const detailsOrder = detailsOrderId
    ? visibleOrders.find((order) => order.id === detailsOrderId) ??
    orders.find((order) => order.id === detailsOrderId) ??
    null
    : null;
  const hasCustomerSearch = customerSearchQuery.trim().length > 0;
  const hasSaleDateFilter = hasSaleDateRangeSelection(saleDateRange);
  const hasOriginFilter = originFilter != null;
  const hasActiveFilter = filter !== null;
  const hasListFilters =
    hasCustomerSearch || hasActiveFilter || hasSaleDateFilter || hasOriginFilter;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Vendas</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            {hasListFilters
              ? `${visibleOrders.length} de ${orders.length} pedido${orders.length !== 1 ? "s" : ""}`
              : `${visibleOrders.length} pedido${visibleOrders.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-sky-100 px-3 text-xs font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 ${SALES_TOOLBAR_SIZE}`}
          >
            Criar Venda Avulsa
          </button>
          <button
            type="button"
            onClick={() => void fetchOrders()}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-50 ${SALES_TOOLBAR_SIZE}`}
          >
            <svg className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </div>
      </div>

      {showWizard && (
        <StandaloneSaleWizard
          products={products}
          onClose={() => setShowWizard(false)}
          onCreated={() => void fetchOrders()}
        />
      )}
      <div className="flex min-w-0 w-full flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 md:justify-between md:overflow-visible">
        <div className="flex shrink-0 items-center gap-1.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleFilter(key)}
              className={`inline-flex shrink-0 items-center gap-2 transition-colors ${SALES_TOOLBAR_CONTROL} ${filter === key
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                }`}
            >
              <span>{label}</span>
              <span
                className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border px-1 text-[11px] font-semibold tabular-nums ${filter === key
                    ? "border-white/25 bg-white/10 text-white"
                    : "border-stone-200 bg-stone-100 text-stone-700"
                  }`}
              >
                {filterCounts[key]}
              </span>
            </button>
          ))}

          <SaleDatePicker
            range={saleDateRange}
            onChange={setSaleDateRange}
          />

          <label className="relative shrink-0">
            <span className="sr-only">Filtrar por origem</span>
            <select
              value={originFilter ?? ""}
              onChange={(e) =>
                setOriginFilter(e.target.value ? e.target.value : null)
              }
              className={`appearance-none ${SALES_TOOLBAR_SIZE} rounded-lg border pr-8 transition-colors focus:outline-none focus:ring-2 focus:ring-stone-200 ${
                hasOriginFilter
                  ? "border-stone-900 bg-stone-900 text-white focus:ring-stone-300"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50 focus:border-stone-400"
              } px-3 sm:px-3.5`}
            >
              <option value="" className="bg-white text-stone-900">
                Origem
              </option>
              {originFilterOptions.map((label) => (
                <option
                  key={label}
                  value={label}
                  className="bg-white text-stone-900"
                >
                  {label}
                </option>
              ))}
            </select>
            <svg
              className={`pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
                hasOriginFilter ? "text-white/80" : "text-stone-400"
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </label>
        </div>

        <label className="relative ml-1.5 min-w-0 w-full max-w-full flex-1 basis-40 md:ml-auto md:max-w-52 lg:max-w-64">
          <span className="sr-only">Buscar por nome do cliente</span>
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            inputMode="search"
            value={customerSearchQuery}
            onChange={(event) => setCustomerSearchQuery(event.target.value)}
            placeholder="Buscar cliente…"
            className={`w-full rounded-lg border border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 ${SALES_TOOLBAR_SIZE} pl-8 ${hasCustomerSearch ? "pr-8" : "pr-3"}`}
          />
          {hasCustomerSearch ? (
            <button
              type="button"
              onClick={() => setCustomerSearchQuery("")}
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          ) : null}
        </label>
      </div>

      {/* Barra de ações em massa */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-stone-700">{selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}</span>
          <div className="ml-2 flex flex-wrap gap-2">
            <BulkBtn onClick={() => bulkShipping("to_pack", "Por embalar")} disabled={bulkLoading}>Por embalar</BulkBtn>
            <BulkBtn onClick={() => bulkShipping("packed", "Por enviar")} disabled={bulkLoading} cls="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">Marcar embalado</BulkBtn>
            <BulkBtn onClick={() => bulkShipping("shipped", "Enviado")} disabled={bulkLoading} cls="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Marcar enviado</BulkBtn>
          </div>
          {bulkLoading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />}
          {bulkMsg && <span className="text-xs text-stone-500">{bulkMsg}</span>}
        </div>
      )}

      {/* Estado vazio / loading */}
      {loading ? (
        <div className="flex items-center gap-2.5 py-10 text-sm text-stone-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
          Carregando pedidos…
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 py-14 text-center">
          <p className="text-sm text-stone-500">
            {hasCustomerSearch
              ? `Nenhum pedido encontrado para “${customerSearchQuery.trim()}”.`
              : hasOriginFilter
                ? `Nenhum pedido encontrado com origem “${originFilter}”.`
                : hasSaleDateFilter
                  ? `Nenhum pedido encontrado no período ${formatSaleDateRangeLabel(saleDateRange)}.`
                  : filter === "waiting"
                    ? "Nenhum pedido aguardando pagamento."
                    : filter === "paid"
                      ? "Nenhum pedido pago encontrado."
                      : filter === "to_pack"
                        ? "Nenhum pedido por embalar."
                        : filter === "cancelled"
                          ? "Nenhuma venda cancelada."
                          : "Nenhuma venda encontrada."}
          </p>
        </div>
      ) : (
        /* ─── Tabela ─── */
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 text-xs font-medium text-stone-500">
                  <th className="w-10 px-4 py-3.5">
                    <input
                      ref={allRef}
                      type="checkbox"
                      aria-label="Selecionar todos"
                      className="h-4 w-4 rounded border-stone-300 accent-stone-900"
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-4 py-3.5 text-left">Pedido</th>
                  <th className="px-4 py-3.5 text-left">Origem</th>
                  <th className="px-4 py-3.5 text-left">Cliente</th>
                  <th className="px-4 py-3.5 text-left">Pagamento</th>
                  <th className="px-4 py-3.5 text-right">Total</th>
                  <th className="px-4 py-3.5 text-left">Envio</th>
                  <th className="w-12 px-3 py-3.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const isDetailsOpen = detailsOrderId === order.id;
                  const isSelected = selectedIds.has(order.id);
                  const isSaleCancelled = order.status === "cancelled";
                  const customerName = orderCustomerName(order);
                  const shippingMethod = shortShippingMethod(
                    order.shippingServiceName,
                    order.fulfillmentType,
                    order.deliveryNotes
                  );
                  const adminSaleNotes = order.internalNotes?.trim() ?? "";
                  const deliveryNotesHint = saleDeliveryUserNotes(order) ?? "";
                  const originLabel = orderOriginLabel(order);

                  return (
                    <Fragment key={order.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        aria-label={`Detalhes da venda #${order.orderNumber ?? "—"}`}
                        onClick={() => openDetails(order.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDetails(order.id);
                          }
                        }}
                        className={`cursor-pointer border-b border-stone-100 transition-colors ${isSaleCancelled
                            ? "bg-stone-50"
                            : isDetailsOpen
                              ? "bg-stone-50/70"
                              : "hover:bg-stone-50/60"
                          } ${isSelected ? "bg-stone-100/70" : ""}`}
                      >
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(order.id)}
                            className="h-4 w-4 rounded border-stone-300 accent-stone-900"
                          />
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-mono ${TABLE_CELL_PRIMARY}`}>
                                #{order.orderNumber ?? "—"}
                              </span>
                              {adminSaleNotes ? (
                                <span onClick={(e) => e.stopPropagation()}>
                                  <OrderNotesHint
                                    notes={adminSaleNotes}
                                    title="Observações da venda"
                                    ariaLabel="Ver observações internas da venda"
                                    tone="violet"
                                    icon="doc"
                                  />
                                </span>
                              ) : null}
                              {deliveryNotesHint ? (
                                <span onClick={(e) => e.stopPropagation()}>
                                  <OrderNotesHint
                                    notes={deliveryNotesHint}
                                    title="Observações da entrega"
                                    ariaLabel="Ver observações da entrega"
                                    tone="sky"
                                    icon="truck"
                                  />
                                </span>
                              ) : null}
                            </div>
                            <p className={TABLE_CELL_SECONDARY}>
                              {fmtDate(order.createdAt)} {fmtTime(order.createdAt)}
                            </p>
                            {isSaleCancelled ? (
                              <span className="text-xs font-normal text-red-600">Cancelado</span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <p className={TABLE_CELL_PRIMARY}>{originLabel}</p>
                        </td>

                        <td className="px-4 py-3.5">
                          <p className={`truncate max-w-[200px] ${TABLE_CELL_PRIMARY}`}>
                            {customerName}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5">
                          <TablePaymentCell order={order} />
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <p className={`tabular-nums ${TABLE_CELL_PRIMARY}`}>
                            {formatPrice(order.total)}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5">
                          {isSaleCancelled ? (
                            <span className="text-xs text-stone-400">—</span>
                          ) : order.paidAt ? (
                            <TableShippingStatus
                              status={order.shippingStatus}
                              shippingMethod={shippingMethod}
                            />
                          ) : (
                            <span className="text-xs text-stone-300">—</span>
                          )}
                        </td>

                        <OrderRowActionsMenu
                          order={order}
                          isDetailsOpen={isDetailsOpen}
                          onToggleDetails={() => toggleDetails(order.id)}
                          onPatchOrder={patchOrder}
                          onRequestCancel={() => requestCancel(order.id)}
                        />
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SaleOrderDrawer
        order={detailsOrder}
        open={detailsOrderId !== null}
        onClose={closeDetails}
        onRefresh={softRefresh}
        onPatchOrder={patchOrder}
        products={products}
        ensureProducts={ensureProducts}
        openCancelForm={cancelFormOrderId === detailsOrderId}
        onCancelIntentHandled={() =>
          setCancelFormOrderId((current) =>
            current === detailsOrderId ? null : current
          )
        }
      />
    </div>
  );
}

function BulkBtn({ onClick, disabled, children, cls }: {
  onClick: () => void; disabled: boolean;
  children: React.ReactNode; cls?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${cls ?? "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"}`}>
      {children}
    </button>
  );
}
