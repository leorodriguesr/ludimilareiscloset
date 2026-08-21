"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { PieceSelector } from "@/components/product/PieceSelector";
import { formatPrice } from "@/lib/format";
import { installmentValueEqualParts } from "@/lib/product-pricing";
import {
  buildCartPieceSelections,
  emptyPieceSelections,
  pieceSelectionsAreComplete,
  type PieceSelectionMap,
} from "@/lib/product-piece-selection";
import type { Product } from "@/lib/types";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import { checkFreeShipping } from "@/lib/shipping/free-shipping";
import { parseDiscountInputValue } from "@/lib/admin-sale/parse-discount-value";
import {
  ADDRESS_COMPLEMENT_MAX_LENGTH,
  ADDRESS_NUMBER_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  isCustomerContactAddressComplete,
  isCustomerNamePhoneComplete,
} from "@/lib/admin-sale/customer-form-complete";
import {
  cepMask,
  cpfFmt,
  lookupAddressByCep,
  onlyDigits,
  phoneFmt,
} from "@/lib/admin-sale/customer-form-input";
import { cpfValidationError } from "@/lib/validation/cpf";
import { useStoreSettings } from "@/lib/hooks/use-store-settings";
import { useAuth } from "@/components/auth/AuthProvider";
import { PERMISSION } from "@/lib/auth/permissions";
import {
  CustomSaleSetsForm,
  type CustomSaleSetInput,
} from "@/components/admin/CustomSaleSetsForm";
import { ProductSearchSelect } from "@/components/admin/ProductSearchSelect";

type DiscountForm = { mode: "FIXED" | "PERCENT"; value: string };

function buildDiscountPayload(discount: DiscountForm | null | undefined) {
  const value = parseDiscountInputValue(discount?.value ?? "");
  if (!discount || value == null) return undefined;
  return { mode: discount.mode, value };
}

type WizardCatalogLine = {
  key: string;
  kind: "catalog";
  product: Product;
  quantity: number;
  selections: PieceSelectionMap;
  itemDiscount: DiscountForm | null;
};

type WizardCustomLine = {
  key: string;
  kind: "custom";
  description: string;
  pieces: CustomSaleSetInput["pieces"];
  unitPrice: number;
  quantity: number;
  itemDiscount: DiscountForm | null;
};

type WizardLine = WizardCatalogLine | WizardCustomLine;

type PricingPreview = {
  subtotalOriginal: number;
  itemsDiscountTotal: number;
  subtotalAfterItemDiscounts: number;
  orderDiscountAmount: number;
  shippingAmount: number;
  total: number;
};

type Props = {
  products: Product[];
  onClose: () => void;
  onCreated: () => void;
};

const STEPS = [
  { id: "products", label: "Produtos", hint: "Itens da venda" },
  { id: "delivery", label: "Entrega", hint: "Frete ou combinar" },
  { id: "customer", label: "Cliente", hint: "Dados e endereço" },
  { id: "payment", label: "Pagamento", hint: "Forma e totais" },
] as const;

type ArrangedMode = "store_delivery" | "pickup" | "uber";

/* ─── UI helpers ─────────────────────────────────────────────── */

function FieldLabel({
  children,
  optional,
}: {
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500">
      {children}
      {optional ? (
        <span className="ml-1 font-normal normal-case text-stone-400">(opcional)</span>
      ) : null}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 ${props.className ?? ""}`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 ${props.className ?? ""}`}
    />
  );
}

function CheckboxOption({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 transition-colors hover:bg-stone-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-stone-900">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-stone-500">{description}</span>
        )}
      </span>
    </label>
  );
}

function ProductPrices({
  product,
  quantity,
}: {
  product: Product;
  quantity: number;
}) {
  const cardTotal = product.price * quantity;
  const pixTotal =
    product.pixPrice != null && product.pixPrice > 0
      ? product.pixPrice * quantity
      : null;
  const installments = Math.floor(product.installmentCount ?? 0);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        <span className="text-sm font-semibold tabular-nums text-stone-900">
          {formatPrice(cardTotal)}
        </span>
        {installments > 0 && (
          <span className="text-xs text-stone-400">
            {installments}× {formatPrice(installmentValueEqualParts(cardTotal, installments))}
          </span>
        )}
      </div>
      {pixTotal != null && (
        <div className="flex items-center gap-1.5">
          <Image src="/pix-icon.svg" alt="" width={14} height={14} unoptimized className="h-3.5 w-3.5 shrink-0 object-contain" />
          <span className="text-sm font-semibold tabular-nums text-stone-700">
            {formatPrice(pixTotal)}
          </span>
          <span className="text-xs text-stone-400">à vista</span>
        </div>
      )}
    </div>
  );
}

type SaleCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string | null;
  orderCount?: number;
  lastAddress: {
    destinationCep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
  } | null;
};

function CustomerSearchSelect({
  selected,
  onSelect,
}: {
  selected: SaleCustomer | null;
  onSelect: (customer: SaleCustomer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<SaleCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setCustomers([]);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams({ q });
          const res = await fetch(`/api/admin/sales/customers?${params}`);
          const data = await res.json();
          if (res.ok) setCustomers(data.customers ?? []);
          else setCustomers([]);
        } catch {
          setCustomers([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [open, query]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="box-border flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-2.5 text-left text-xs font-medium transition-colors hover:border-stone-300 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
      >
        <span className={selected ? "truncate text-stone-900" : "text-stone-500"}>
          {selected ? selected.name : "Buscar cliente…"}
        </span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-100 p-3">
            <input
              autoFocus
              placeholder="Buscar por nome, telefone, CPF ou e-mail…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto overscroll-contain p-1">
            {query.trim().length < 2 ? (
              <li className="px-3 py-6 text-center text-sm text-stone-400">
                Digite pelo menos 2 caracteres para buscar.
              </li>
            ) : loading ? (
              <li className="px-3 py-6 text-center text-sm text-stone-400">Buscando…</li>
            ) : customers.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-stone-400">
                Nenhum cliente encontrado.
              </li>
            ) : (
              customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-stone-50"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-stone-900">{c.name}</span>
                      {c.orderCount != null && c.orderCount > 0 && (
                        <span className="shrink-0 text-[11px] text-stone-400">
                          {c.orderCount} {c.orderCount === 1 ? "compra" : "compras"}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-xs text-stone-500">
                      {[
                        c.phone ? phoneFmt(c.phone) : null,
                        c.email || null,
                        c.lastAddress?.city || null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}


function PaymentMethodSelector({
  paymentMethod,
  onChange,
  alreadyPaid = false,
}: {
  paymentMethod: "pix" | "card" | null;
  onChange: (m: "pix" | "card") => void;
  alreadyPaid?: boolean;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <p className="mb-2.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        {alreadyPaid ? "Como foi pago" : "Forma de pagamento"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange("pix")}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
            paymentMethod === "pix"
              ? "border-sky-300 bg-sky-100 text-sky-900"
              : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:bg-stone-50"
          }`}
        >
          <Image
            src="/pix-icon.svg"
            alt=""
            width={16}
            height={16}
            unoptimized
            className="h-4 w-4 shrink-0 object-contain"
          />
          <span
            className={`text-sm font-medium ${
              paymentMethod === "pix" ? "text-sky-900" : "text-stone-500"
            }`}
          >
            Pix
          </span>
        </button>

        <button
          type="button"
          onClick={() => onChange("card")}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
            paymentMethod === "card"
              ? "border-sky-300 bg-sky-100 text-sky-900"
              : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:bg-stone-50"
          }`}
        >
          <svg
            className="h-4 w-4 shrink-0 text-stone-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
          <span
            className={`text-sm font-medium ${
              paymentMethod === "card" ? "text-sky-900" : "text-stone-500"
            }`}
          >
            Cartão
          </span>
        </button>
      </div>
    </div>
  );
}

function orderRefLabel(orderNumber: number | null | undefined): string {
  return orderNumber != null ? ` #${orderNumber}` : "";
}

/** Mensagem pronta para WhatsApp (link de preenchimento de dados). */
function buildCustomerDataShareMessage(
  orderNumber: number,
  url: string
): string {
  return [
    "",
    `📦 Para prosseguirmos com a entrega do seu pedido${orderRefLabel(orderNumber)}, por favor, preencha seus dados neste link:`,
    "",
    url,
    "",
    "Qualquer dúvida, é só me chamar por aqui.",
  ].join("\n");
}

/** Mensagem pronta para WhatsApp (link da página de pagamento Pix). */
function buildPixShareMessage(
  orderNumber: number,
  paymentUrl: string,
  amount: number
): string {
  return [
    "",
    `Seu pedido${orderRefLabel(orderNumber)} foi gerado com sucesso!`,
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

function CopyBlock({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: string;
  /** Texto enviado à área de transferência (padrão: `value`). */
  copyValue?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={value}
          className="min-w-0 flex-1 break-all rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs leading-relaxed text-stone-700"
        />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(copyValue ?? value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="shrink-0 rounded-lg bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900 ring-1 ring-sky-200/80 hover:bg-sky-200"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function OrderSummary({
  pricing,
  paymentMethod,
  maxInstallments,
  shippingLabel,
}: {
  pricing: { pix: PricingPreview | null; card: PricingPreview | null };
  paymentMethod: "pix" | "card" | null;
  maxInstallments: number;
  shippingLabel: string;
}) {
  // Breakdown usa cartão como base até o método ser escolhido (preço de lista).
  const active = paymentMethod ? pricing[paymentMethod] : pricing.card ?? pricing.pix;
  if (!active) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/80 p-5 text-sm text-stone-400">
        Adicione produtos para ver o resumo.
      </div>
    );
  }

  const pixTotal = pricing.pix?.total ?? null;
  const cardTotal = pricing.card?.total ?? null;
  const cardInstallment =
    cardTotal != null ? installmentValueEqualParts(cardTotal, maxInstallments) : null;
  const selectedClass = "border border-sky-300 bg-sky-50";
  const idleClass = "border border-transparent bg-stone-50";

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Resumo</p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between text-stone-600">
          <dt>Produtos</dt>
          <dd className="tabular-nums">{formatPrice(active.subtotalOriginal)}</dd>
        </div>
        {active.itemsDiscountTotal > 0 && (
          <div className="flex justify-between text-red-600">
            <dt>Descontos por item</dt>
            <dd className="tabular-nums">-{formatPrice(active.itemsDiscountTotal)}</dd>
          </div>
        )}
        <div className="flex justify-between text-stone-600">
          <dt>Entrega / frete</dt>
          <dd className="tabular-nums">{shippingLabel}</dd>
        </div>
        {active.orderDiscountAmount > 0 && (
          <div className="flex justify-between text-red-600">
            <dt>Desconto geral</dt>
            <dd className="tabular-nums">-{formatPrice(active.orderDiscountAmount)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 space-y-2 border-t border-stone-100 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
          Total por pagamento
        </p>
        <div
          className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 ${
            paymentMethod === "pix" ? selectedClass : idleClass
          }`}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <Image
              src="/pix-icon.svg"
              alt=""
              width={14}
              height={14}
              unoptimized
              className="h-3.5 w-3.5 shrink-0 object-contain"
            />
            <span className="text-sm font-medium text-stone-700">Pix</span>
            <span className="text-[11px] text-stone-400">à vista</span>
          </div>
          <span className="text-sm font-semibold tabular-nums text-stone-900">
            {pixTotal != null ? formatPrice(pixTotal) : "—"}
          </span>
        </div>
        <div
          className={`rounded-lg px-3 py-2.5 ${
            paymentMethod === "card" ? selectedClass : idleClass
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <svg
                className="h-3.5 w-3.5 shrink-0 text-stone-500"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              <span className="text-sm font-medium text-stone-700">Cartão</span>
            </div>
            <span className="text-sm font-semibold tabular-nums text-stone-900">
              {cardTotal != null ? formatPrice(cardTotal) : "—"}
            </span>
          </div>
          {cardInstallment != null && maxInstallments > 0 && (
            <p className="mt-0.5 text-right text-[11px] tabular-nums text-stone-400">
              {maxInstallments}× {formatPrice(cardInstallment)} s/ juros
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main wizard ────────────────────────────────────────────── */

export function StandaloneSaleWizard({
  products,
  onClose,
  onCreated,
}: Props) {
  const { settings } = useStoreSettings();
  const { loading: authLoading, hasPermission } = useAuth();
  const canMarkAlreadyPaid =
    !authLoading && hasPermission(PERMISSION.ADMIN_SALE_MARK_PAID);
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<WizardLine[]>([]);
  const [catalog, setCatalog] = useState(products);
  const [showCustomSets, setShowCustomSets] = useState(false);

  useEffect(() => {
    setCatalog(products);
  }, [products]);

  const [fulfillmentType, setFulfillmentType] = useState<"CARRIER" | "ARRANGED">("CARRIER");
  const [arrangedMode, setArrangedMode] = useState<ArrangedMode | null>(null);
  const [destinationCep, setDestinationCep] = useState("");
  const [shippingOptions, setShippingOptions] = useState<NormalizedShippingOption[]>([]);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [customerData, setCustomerData] = useState<"now" | "later">("now");
  const [customerEntryMode, setCustomerEntryMode] = useState<"search" | "new">("search");
  const [selectedCustomer, setSelectedCustomer] = useState<SaleCustomer | null>(null);
  const [addressFromLastOrder, setAddressFromLastOrder] = useState(false);
  const [contact, setContact] = useState({ name: "", email: "", phone: "", cpf: "" });
  const [address, setAddress] = useState({
    destinationCep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
  });
  const [cepLookupError, setCepLookupError] = useState<string | null>(null);
  const [paymentAlreadyPaid, setPaymentAlreadyPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card" | null>(null);

  useEffect(() => {
    if (!canMarkAlreadyPaid) setPaymentAlreadyPaid(false);
  }, [canMarkAlreadyPaid]);

  const [orderDiscount, setOrderDiscount] = useState<DiscountForm | null>(null);
  const [pricingByMethod, setPricingByMethod] = useState<{
    pix: PricingPreview | null;
    card: PricingPreview | null;
  }>({ pix: null, card: null });
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    orderNumber: number;
    total: number;
    customerDataUrl?: string;
    payment?: {
      type: string;
      paymentUrl?: string;
      paymentPath?: string;
      pixCode?: string;
      checkoutUrl?: string;
    };
  } | null>(null);

  const maxInstallments = useMemo(
    () =>
      lines.reduce((max, l) => {
        if (l.kind !== "catalog") return max;
        const n = Math.floor(l.product.installmentCount ?? 0);
        return n > max ? n : max;
      }, 1),
    [lines]
  );


  const merchandiseTotal = useMemo(() => {
    const preview = paymentMethod
      ? pricingByMethod[paymentMethod]
      : pricingByMethod.card ?? pricingByMethod.pix;
    if (preview) return preview.subtotalAfterItemDiscounts;
    return lines.reduce((sum, l) => {
      const unit = l.kind === "custom" ? l.unitPrice : l.product.price;
      return sum + unit * l.quantity;
    }, 0);
  }, [paymentMethod, pricingByMethod, lines]);

  const freeShippingResult = settings
    ? checkFreeShipping(settings, merchandiseTotal)
    : null;
  const isFreeShipping = freeShippingResult?.isFree ?? false;

  const cheapestShippingId = useMemo(() => {
    if (!shippingOptions.length) return null;
    return [...shippingOptions].sort((a, b) => a.price - b.price)[0]?.id ?? null;
  }, [shippingOptions]);

  const displayShippingOptions = useMemo(() => {
    if (!isFreeShipping) return shippingOptions;
    return [...shippingOptions].sort((a, b) => a.price - b.price);
  }, [shippingOptions, isFreeShipping]);

  const shippingAmount = useMemo(() => {
    if (fulfillmentType === "ARRANGED") {
      // Entregador da loja / Uber: a combinar; retirada: grátis.
      return 0;
    }
    const opt = shippingOptions.find((o) => o.id === selectedShippingId);
    if (!opt) return 0;
    if (isFreeShipping && opt.id === cheapestShippingId) return 0;
    return opt.price;
  }, [
    fulfillmentType,
    shippingOptions,
    selectedShippingId,
    isFreeShipping,
    cheapestShippingId,
  ]);

  const shippingLabel = useMemo(() => {
    if (fulfillmentType === "ARRANGED") {
      if (!arrangedMode) return "A definir";
      if (arrangedMode === "pickup") return "Grátis";
      // store_delivery e uber
      return "A combinar";
    }
    const opt = shippingOptions.find((o) => o.id === selectedShippingId);
    if (!opt) return "A calcular";
    if (isFreeShipping && opt.id === cheapestShippingId) return "Grátis";
    return formatPrice(opt.price);
  }, [
    fulfillmentType,
    arrangedMode,
    shippingOptions,
    selectedShippingId,
    isFreeShipping,
    cheapestShippingId,
  ]);

  const activePricing = paymentMethod
    ? pricingByMethod[paymentMethod]
    : pricingByMethod.card ?? pricingByMethod.pix;

  const linesPayload = useCallback(
    () =>
      lines.map((l) => {
        if (l.kind === "custom") {
          return {
            kind: "custom" as const,
            description: l.description,
            pieces: l.pieces,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            itemDiscount: buildDiscountPayload(l.itemDiscount),
          };
        }
        return {
          kind: "catalog" as const,
          productId: l.product.id,
          quantity: l.quantity,
          pieceSelections: buildCartPieceSelections(
            l.product.pieces,
            l.selections
          ),
          itemDiscount: buildDiscountPayload(l.itemDiscount),
        };
      }),
    [lines]
  );

  const refreshPricing = useCallback(async () => {
    if (lines.length === 0) {
      setPricingByMethod({ pix: null, card: null });
      return;
    }
    const payloadLines = linesPayload();
    const discount = buildDiscountPayload(orderDiscount);
    try {
      const [pixRes, cardRes] = await Promise.all([
        fetch("/api/admin/sales/preview-pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: payloadLines,
            paymentMethod: "pix",
            shippingAmount,
            orderDiscount: discount,
          }),
        }),
        fetch("/api/admin/sales/preview-pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: payloadLines,
            paymentMethod: "card",
            shippingAmount,
            orderDiscount: discount,
          }),
        }),
      ]);
      const [pixData, cardData] = await Promise.all([pixRes.json(), cardRes.json()]);
      setPricingByMethod({
        pix: pixRes.ok ? pixData : null,
        card: cardRes.ok ? cardData : null,
      });
    } catch {
      /* ignore */
    }
  }, [lines.length, linesPayload, shippingAmount, orderDiscount]);

  useEffect(() => {
    void refreshPricing();
  }, [refreshPricing]);

  function addProduct(product: Product) {
    setLines((prev) => [
      ...prev,
      {
        key: `${product.id}-${Date.now()}`,
        kind: "catalog",
        product,
        quantity: 1,
        selections: emptyPieceSelections(product.pieces),
        itemDiscount: null,
      },
    ]);
    setError(null);
  }

  function handleCustomSetsAdded(sets: CustomSaleSetInput[]) {
    setLines((prev) => [
      ...prev,
      ...sets.map((set) => ({
        key: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "custom" as const,
        description: set.description,
        pieces: set.pieces,
        unitPrice: set.unitPrice,
        quantity: 1,
        itemDiscount: null,
      })),
    ]);
    setShowCustomSets(false);
    setError(null);
  }

  async function lookupAddressCep(digits: string) {
    if (digits.length !== 8) return;
    setCepLookupError(null);
    const result = await lookupAddressByCep(digits);
    if (!result.ok) {
      setCepLookupError(result.error);
      return;
    }
    setAddress((a) => ({
      ...a,
      destinationCep: digits,
      street: result.address.street || a.street,
      neighborhood: result.address.neighborhood || a.neighborhood,
      city: result.address.city || a.city,
      state: result.address.state || a.state,
    }));
  }

  useEffect(() => {
    if (addressFromLastOrder) return;
    const digits = onlyDigits(address.destinationCep, 8);
    if (digits.length !== 8) return;
    const t = setTimeout(() => void lookupAddressCep(digits), 400);
    return () => clearTimeout(t);
  }, [address.destinationCep, addressFromLastOrder]);

  function updateLine(
    idx: number,
    patch: Partial<WizardCatalogLine> | Partial<WizardCustomLine>
  ) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        return { ...l, ...patch } as WizardLine;
      })
    );
  }

  async function quoteShipping() {
    setLoadingQuote(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sales/quote-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationCep: onlyDigits(destinationCep, 8),
          lines: linesPayload(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao cotar frete.");
      const options = (data.options ?? []) as NormalizedShippingOption[];
      setShippingOptions(options);
      const preferred =
        isFreeShipping && options.length
          ? [...options].sort((a, b) => a.price - b.price)[0]
          : options[0];
      setSelectedShippingId(preferred?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cotar frete.");
    } finally {
      setLoadingQuote(false);
    }
  }

  async function handleSubmit() {
    if (!paymentMethod) {
      setError("Selecione a forma de pagamento.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: linesPayload(),
          fulfillmentType,
          carrierShipping:
            fulfillmentType === "CARRIER"
              ? { destinationCep: onlyDigits(destinationCep, 8), optionId: selectedShippingId }
              : undefined,
          arrangedShippingAmount:
            fulfillmentType === "ARRANGED" ? 0 : undefined,
          arrangedMode:
            fulfillmentType === "ARRANGED" ? arrangedMode ?? undefined : undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
          internalNotes: internalNotes || undefined,
          customerData: fulfillmentType === "ARRANGED" ? "now" : customerData,
          contact:
            fulfillmentType === "ARRANGED" || customerData === "later"
              ? { name: contact.name, phone: contact.phone }
              : contact,
          address:
            customerData === "now" && fulfillmentType === "CARRIER"
              ? {
                  ...address,
                  destinationCep: onlyDigits(destinationCep, 8) || onlyDigits(address.destinationCep, 8),
                }
              : undefined,
          paymentAlreadyPaid: canMarkAlreadyPaid && paymentAlreadyPaid,
          paymentMethod,
          orderDiscount: buildDiscountPayload(orderDiscount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar venda.");
      setResult(data);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar venda.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (fulfillmentType === "ARRANGED" && customerData !== "now") {
      setCustomerData("now");
    }
  }, [fulfillmentType, customerData]);

  function clearCustomerForm() {
    setSelectedCustomer(null);
    setAddressFromLastOrder(false);
    setContact({ name: "", email: "", phone: "", cpf: "" });
    setAddress({
      destinationCep: "",
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
    });
    setCepLookupError(null);
  }

  function applyCustomer(customer: SaleCustomer) {
    setSelectedCustomer(customer);
    setCustomerEntryMode("search");
    setCustomerData("now");
    setContact({
      name: customer.name,
      email: customer.email,
      phone: onlyDigits(customer.phone, 11),
      cpf: onlyDigits(customer.cpf ?? "", 11),
    });
    if (customer.lastAddress) {
      setAddress({
        destinationCep: onlyDigits(customer.lastAddress.destinationCep, 8),
        street: customer.lastAddress.street,
        number: customer.lastAddress.number,
        complement: customer.lastAddress.complement,
        neighborhood: customer.lastAddress.neighborhood,
        city: customer.lastAddress.city,
        state: customer.lastAddress.state.toUpperCase().slice(0, 2),
      });
      setAddressFromLastOrder(true);
      setCepLookupError(null);
      if (fulfillmentType === "CARRIER") {
        setDestinationCep(onlyDigits(customer.lastAddress.destinationCep, 8));
      }
    } else {
      setAddress({
        destinationCep: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
      });
      setAddressFromLastOrder(false);
    }
  }

  function startNewCustomer() {
    clearCustomerForm();
    setCustomerEntryMode("new");
    setCustomerData("now");
  }

  const customerStepComplete = useMemo(() => {
    if (!selectedCustomer && customerEntryMode !== "new") return false;
    if (fulfillmentType === "ARRANGED" || customerData === "later") {
      return isCustomerNamePhoneComplete({
        name: contact.name,
        phone: contact.phone,
      });
    }
    return isCustomerContactAddressComplete({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      cpf: contact.cpf,
      destinationCep: address.destinationCep,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
    });
  }, [
    address,
    contact,
    customerData,
    customerEntryMode,
    fulfillmentType,
    selectedCustomer,
  ]);

  const canGoNext =
    step === 0
      ? lines.length > 0 &&
        lines.every((l) =>
          l.kind === "custom"
            ? true
            : pieceSelectionsAreComplete(l.product.pieces, l.selections)
        )
      : step === 1
        ? fulfillmentType === "ARRANGED"
          ? arrangedMode !== null
          : Boolean(selectedShippingId)
        : step === 2
          ? customerStepComplete
          : paymentMethod != null;

  /* ─── Success screen ───────────────────────────────────────── */

  if (result) {
    const absoluteFromMaybeLocal = (url: string | undefined) => {
      if (!url) return null;
      try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        if (
          host === "localhost" ||
          host === "127.0.0.1" ||
          host === "0.0.0.0"
        ) {
          return `${window.location.origin}${parsed.pathname}${parsed.search}`;
        }
        return parsed.toString();
      } catch {
        if (url.startsWith("/")) return `${window.location.origin}${url}`;
        return url;
      }
    };

    const customerShareUrl = absoluteFromMaybeLocal(result.customerDataUrl);

    const pixShareUrl = (() => {
      if (result.payment?.type !== "pix") return null;
      if (result.payment.paymentPath) {
        return `${window.location.origin}${result.payment.paymentPath}`;
      }
      return absoluteFromMaybeLocal(result.payment.paymentUrl);
    })();

    return (
      <div className="fixed inset-0 z-50 flex bg-stone-900/50 backdrop-blur-sm">
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white md:m-auto md:h-auto md:max-h-[calc(100dvh-2rem)] md:max-w-lg md:rounded-2xl md:border md:border-stone-200 md:shadow-xl">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-center text-xl font-semibold text-stone-900">
              Venda #{result.orderNumber} criada
            </h3>
            <p className="mt-1 text-center text-sm text-stone-500">
              Total: {formatPrice(result.total)}
            </p>
            <div className="mt-6 space-y-3">
              {customerShareUrl && (
                <CopyBlock
                  label="Link para o cliente preencher dados"
                  value={customerShareUrl}
                  copyValue={buildCustomerDataShareMessage(
                    result.orderNumber,
                    customerShareUrl
                  )}
                />
              )}
              {pixShareUrl && (
                <CopyBlock
                  label="Link de pagamento (Pix)"
                  value={pixShareUrl}
                  copyValue={buildPixShareMessage(
                    result.orderNumber,
                    pixShareUrl,
                    result.total
                  )}
                />
              )}
              {result.payment?.type === "pix" &&
                !pixShareUrl &&
                result.payment.pixCode && (
                <CopyBlock
                  label="Código PIX"
                  value={result.payment.pixCode}
                />
              )}
              {result.payment?.type === "card" && result.payment.checkoutUrl && (
                <CopyBlock label="Link de pagamento (cartão)" value={result.payment.checkoutUrl} />
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-stone-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-sky-100 py-3 text-sm font-semibold text-sky-900 ring-1 ring-sky-200/80 hover:bg-sky-200"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Wizard shell ───────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-50 flex bg-stone-900/50 backdrop-blur-sm">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white md:m-auto md:h-[min(48rem,calc(100dvh-2rem))] md:max-h-[min(48rem,calc(100dvh-2rem))] md:w-full md:max-w-6xl md:rounded-2xl md:border md:border-stone-200 md:shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-4 py-4 sm:px-6">
          <div className="min-w-0 pr-3">
            <h2 className="truncate text-base font-semibold text-stone-900 sm:text-lg">Nova venda avulsa</h2>
            <p className="mt-0.5 truncate text-xs text-stone-500 sm:text-sm">
              {STEPS[step].label} · {step + 1}/{STEPS.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Timeline de etapas */}
        <div className="shrink-0 border-b border-stone-100 bg-stone-50/80 px-3 py-3 sm:px-6">
          <ol className="flex w-full items-start gap-0 overflow-x-auto overscroll-x-contain p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {STEPS.map((s, i) => {
              const active = i === step;
              const done = i < step;
              const isLast = i === STEPS.length - 1;
              return (
                <li key={s.id} className="flex min-w-0 flex-1 items-start">
                  <div className="flex w-full min-w-[4.5rem] flex-col items-center gap-1.5 sm:min-w-0">
                    <div className="flex w-full items-center">
                      {i > 0 ? (
                        <span
                          className={`h-px flex-1 ${
                            done || active ? "bg-stone-400" : "bg-stone-200"
                          }`}
                          aria-hidden
                        />
                      ) : (
                        <span className="flex-1" aria-hidden />
                      )}
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold sm:h-8 sm:w-8 sm:text-xs ${
                          active
                            ? "bg-stone-900 text-white ring-4 ring-stone-900/10"
                            : done
                              ? "bg-stone-800 text-white"
                              : "border border-stone-200 bg-white text-stone-400"
                        }`}
                      >
                        {done ? (
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </span>
                      {!isLast ? (
                        <span
                          className={`h-px flex-1 ${
                            done ? "bg-stone-400" : "bg-stone-200"
                          }`}
                          aria-hidden
                        />
                      ) : (
                        <span className="flex-1" aria-hidden />
                      )}
                    </div>
                    <span
                      className={`max-w-full px-0.5 text-center text-[10px] font-medium leading-tight sm:text-[11px] ${
                        active
                          ? "text-stone-900"
                          : done
                            ? "text-stone-600"
                            : "text-stone-400"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6">
            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Step 0 — Produtos */}
            {step === 0 && (
              <div className="space-y-5">
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900">Produtos</h3>
                    <p className="mt-0.5 text-xs text-stone-500">
                      Selecione do catálogo ou descreva conjuntos vendidos sem cadastrar produto.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                    <ProductSearchSelect products={catalog} onSelect={addProduct} />
                    <button
                      type="button"
                      onClick={() => setShowCustomSets((v) => !v)}
                      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                        showCustomSets
                          ? "border-sky-300 bg-sky-100 text-sky-900"
                          : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                      }`}
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
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                      Novo produto
                    </button>
                  </div>
                  {showCustomSets && (
                    <CustomSaleSetsForm
                      compact
                      onAdd={handleCustomSetsAdded}
                      onCancel={() => setShowCustomSets(false)}
                    />
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold text-stone-900">
                      Itens da venda
                      {lines.length > 0 ? (
                        <span className="ml-1.5 font-normal text-stone-400">({lines.length})</span>
                      ) : null}
                    </h3>
                  </div>

                  {lines.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center">
                      <p className="text-sm text-stone-500">Nenhum produto adicionado ainda.</p>
                      <p className="mt-1 text-xs text-stone-400">
                        Use o seletor acima para incluir o primeiro item.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
                      {lines.map((line, idx) => (
                        <li key={line.key} className="p-4 sm:p-5">
                          <div className="flex gap-3 sm:gap-4">
                            {line.kind === "catalog" ? (
                              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-100 sm:h-16 sm:w-16">
                                {line.product.images[0]?.url && (
                                  <Image
                                    src={line.product.images[0].url}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="64px"
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-[10px] font-semibold uppercase tracking-wide text-stone-400 sm:h-16 sm:w-16">
                                Conj.
                              </div>
                            )}

                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  {line.kind === "catalog" ? (
                                    <>
                                      <p className="text-sm font-medium leading-snug text-stone-900 sm:text-[15px]">
                                        {line.product.name}
                                      </p>
                                      {line.product.description ? (
                                        <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">
                                          {line.product.description}
                                        </p>
                                      ) : null}
                                      <ProductPrices
                                        product={line.product}
                                        quantity={line.quantity}
                                      />
                                    </>
                                  ) : (
                                    <>
                                      <p className="whitespace-pre-wrap text-sm font-medium leading-snug text-stone-900 sm:text-[15px]">
                                        {line.description}
                                      </p>
                                      {line.pieces.length > 0 ? (
                                        <ul className="mt-1 space-y-0.5 text-xs text-stone-500">
                                          {line.pieces.map((piece, pieceIdx) => {
                                            const details = [
                                              piece.name,
                                              piece.size,
                                              piece.color,
                                            ].filter(Boolean);
                                            if (details.length === 0) return null;
                                            return (
                                              <li key={`${line.key}-piece-${pieceIdx}`}>
                                                {details.join(" · ")}
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      ) : null}
                                      <p className="mt-1.5 text-sm font-semibold tabular-nums text-stone-900">
                                        {formatPrice(line.unitPrice * line.quantity)}
                                      </p>
                                    </>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLines((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-800"
                                >
                                  Remover
                                </button>
                              </div>

                              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[6rem_minmax(0,12rem)] sm:gap-3">
                                <div>
                                  <FieldLabel>Qtd</FieldLabel>
                                  <TextInput
                                    type="number"
                                    min={1}
                                    value={line.quantity}
                                    onChange={(e) =>
                                      updateLine(idx, {
                                        quantity: Math.max(1, Number(e.target.value) || 1),
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <FieldLabel>Desconto</FieldLabel>
                                  <div className="flex gap-1.5">
                                    <select
                                      value={line.itemDiscount?.mode ?? "FIXED"}
                                      onChange={(e) =>
                                        updateLine(idx, {
                                          itemDiscount: {
                                            mode: e.target.value as "FIXED" | "PERCENT",
                                            value: line.itemDiscount?.value ?? "",
                                          },
                                        })
                                      }
                                      className="w-14 shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-2.5 text-sm text-stone-700 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
                                    >
                                      <option value="FIXED">R$</option>
                                      <option value="PERCENT">%</option>
                                    </select>
                                    <TextInput
                                      placeholder="0"
                                      value={line.itemDiscount?.value ?? ""}
                                      onChange={(e) =>
                                        updateLine(idx, {
                                          itemDiscount: {
                                            mode: line.itemDiscount?.mode ?? "FIXED",
                                            value: e.target.value,
                                          },
                                        })
                                      }
                                      className="min-w-0 flex-1"
                                    />
                                  </div>
                                </div>
                              </div>

                              {line.kind === "catalog" && line.product.pieces.length > 0 && (
                                <div className="border-t border-stone-100 pt-3">
                                  <FieldLabel>Variantes</FieldLabel>
                                  <PieceSelector
                                    pieces={line.product.pieces}
                                    selections={line.selections}
                                    onSelectionsChange={(next) =>
                                      updateLine(idx, { selections: next })
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <FieldLabel optional>Observações internas</FieldLabel>
                  <TextArea
                    rows={2}
                    placeholder="Visível apenas para admin e gestor…"
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                  />
                </section>
              </div>
            )}

            {/* Step 1 — Entrega */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <CheckboxOption
                    checked={fulfillmentType === "CARRIER"}
                    onChange={() => {
                      setFulfillmentType("CARRIER");
                      setArrangedMode(null);
                    }}
                    label="Transportadora"
                    description="Cotação SuperFrete com valor real"
                  />
                  <CheckboxOption
                    checked={fulfillmentType === "ARRANGED"}
                    onChange={() => {
                      setFulfillmentType("ARRANGED");
                      setSelectedShippingId("");
                      setShippingOptions([]);
                    }}
                    label="Entrega a combinar"
                    description="Entregador da loja, retirada ou Uber"
                  />
                </div>

                {fulfillmentType === "CARRIER" ? (
                  <div className="space-y-4 rounded-xl border border-stone-200 p-5">
                    {settings?.freeShippingEnabled && freeShippingResult ? (
                      isFreeShipping ? (
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                          <svg
                            className="h-4 w-4 shrink-0 text-emerald-600"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <p className="text-xs font-medium text-emerald-700">
                            Frete grátis conquistado!
                          </p>
                        </div>
                      ) : freeShippingResult.missingAmount != null &&
                        freeShippingResult.minValue != null ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-stone-600">
                            Falta{" "}
                            <span className="font-semibold text-stone-900">
                              {formatPrice(freeShippingResult.missingAmount)}
                            </span>{" "}
                            para{" "}
                            <span className="font-semibold text-stone-900">
                              frete grátis
                            </span>
                          </p>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                            <div
                              className="h-full rounded-full bg-stone-900 transition-all duration-500"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (merchandiseTotal / freeShippingResult.minValue) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : null
                    ) : null}
                    <div>
                      <FieldLabel>CEP de destino</FieldLabel>
                      <div className="flex items-stretch gap-2">
                        <TextInput
                          placeholder="00000-000"
                          value={cepMask(onlyDigits(destinationCep, 8))}
                          onChange={(e) => setDestinationCep(onlyDigits(e.target.value, 8))}
                        />
                        <button
                          type="button"
                          onClick={() => void quoteShipping()}
                          disabled={loadingQuote || onlyDigits(destinationCep, 8).length !== 8}
                          className="shrink-0 rounded-lg bg-sky-100 px-4 py-2.5 text-sm font-semibold text-sky-900 ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 disabled:opacity-40"
                        >
                          {loadingQuote ? "Calculando…" : "Calcular"}
                        </button>
                      </div>
                    </div>
                    {displayShippingOptions.length > 0 && (
                      <div className="space-y-2">
                        <FieldLabel>Opção de frete</FieldLabel>
                        {displayShippingOptions.map((opt, idx) => {
                          const optionIsFree = isFreeShipping && idx === 0;
                          return (
                          <label
                            key={opt.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
                              selectedShippingId === opt.id
                                ? "border-sky-300 bg-sky-50"
                                : "border-stone-200 hover:border-stone-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name="shipping"
                              checked={selectedShippingId === opt.id}
                              onChange={() => setSelectedShippingId(opt.id)}
                              className="accent-sky-600"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-stone-900">
                                {opt.carrierName} — {opt.serviceName}
                              </p>
                              {opt.deliveryDaysMax > 0 && (
                                <p className="text-xs text-stone-500">
                                  até {opt.deliveryDaysMax} dias úteis
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              {optionIsFree ? (
                                <>
                                  <p className="text-sm font-semibold text-emerald-600">
                                    Grátis
                                  </p>
                                  {opt.price > 0 && (
                                    <p className="text-xs tabular-nums text-stone-400 line-through">
                                      {formatPrice(opt.price)}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <span className="text-sm font-semibold tabular-nums text-stone-900">
                                  {formatPrice(opt.price)}
                                </span>
                              )}
                            </div>
                          </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl border border-stone-200 p-5">
                    <FieldLabel>Tipo de entrega</FieldLabel>
                    <div className="space-y-2">
                      <CheckboxOption
                        checked={arrangedMode === "store_delivery"}
                        onChange={() => setArrangedMode("store_delivery")}
                        label="Entregador da loja"
                        description="Frete a combinar"
                      />
                      <CheckboxOption
                        checked={arrangedMode === "pickup"}
                        onChange={() => setArrangedMode("pickup")}
                        label="Retirada"
                      />
                      <CheckboxOption
                        checked={arrangedMode === "uber"}
                        onChange={() => setArrangedMode("uber")}
                        label="Uber"
                        description="Frete a combinar"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <FieldLabel>Observações da entrega</FieldLabel>
                  <TextArea
                    rows={2}
                    placeholder="Ex.: Entregar após 18h, retirar na portaria…"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Step 2 — Cliente */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                  <CustomerSearchSelect
                    selected={selectedCustomer}
                    onSelect={applyCustomer}
                  />
                  <button
                    type="button"
                    onClick={startNewCustomer}
                    className={`inline-flex h-8 shrink-0 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                      customerEntryMode === "new"
                        ? "border-sky-300 bg-sky-100 text-sky-900"
                        : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    Novo cliente
                  </button>
                </div>

                {fulfillmentType === "CARRIER" && customerEntryMode === "new" && !selectedCustomer && (
                  <div className="space-y-2">
                    <CheckboxOption
                      checked={customerData === "now"}
                      onChange={() => setCustomerData("now")}
                      label="Preencher agora"
                      description="Informar dados do cliente nesta etapa"
                    />
                    <CheckboxOption
                      checked={customerData === "later"}
                      onChange={() => setCustomerData("later")}
                      label="Adicionar depois"
                      description="Informe nome e telefone agora; o cliente completa o endereço pelo link"
                    />
                  </div>
                )}

                {(selectedCustomer || customerEntryMode === "new") &&
                  (fulfillmentType === "ARRANGED" ||
                    (fulfillmentType === "CARRIER" && customerData === "later")) && (
                  <div className="rounded-xl border border-stone-200 p-5">
                    <p className="mb-3 text-xs text-stone-500">
                      {fulfillmentType === "ARRANGED"
                        ? "Entrega a combinar — informe nome e telefone. Localização e detalhes ficam nas observações da entrega ou no WhatsApp."
                        : "Informe pelo menos o nome e o telefone para identificar o cliente. O endereço pode ser preenchido depois pelo link."}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <FieldLabel>Nome</FieldLabel>
                        <TextInput
                          maxLength={CUSTOMER_NAME_MAX_LENGTH}
                          value={contact.name}
                          onChange={(e) =>
                            setContact((c) => ({
                              ...c,
                              name: e.target.value.slice(0, CUSTOMER_NAME_MAX_LENGTH),
                            }))
                          }
                        />
                        <p className="mt-1 text-[10px] text-stone-400">
                          Máx. {CUSTOMER_NAME_MAX_LENGTH} caracteres
                        </p>
                      </div>
                      <div>
                        <FieldLabel>Telefone</FieldLabel>
                        <TextInput
                          inputMode="numeric"
                          placeholder="(00) 00000-0000"
                          value={phoneFmt(contact.phone)}
                          onChange={(e) =>
                            setContact((c) => ({
                              ...c,
                              phone: e.target.value.replace(/\D/g, "").slice(0, 11),
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {(selectedCustomer || customerEntryMode === "new") &&
                  customerData === "now" &&
                  fulfillmentType === "CARRIER" && (
                  <div className="space-y-5 rounded-xl border border-stone-200 p-5">
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">
                        Contato
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <FieldLabel>Nome completo</FieldLabel>
                          <TextInput
                            maxLength={CUSTOMER_NAME_MAX_LENGTH}
                            value={contact.name}
                            onChange={(e) =>
                              setContact((c) => ({
                                ...c,
                                name: e.target.value.slice(0, CUSTOMER_NAME_MAX_LENGTH),
                              }))
                            }
                          />
                          <p className="mt-1 text-[10px] text-stone-400">
                            Máx. {CUSTOMER_NAME_MAX_LENGTH} caracteres
                          </p>
                        </div>
                        <div>
                          <FieldLabel>E-mail</FieldLabel>
                          <TextInput
                            type="email"
                            required
                            value={contact.email}
                            onChange={(e) =>
                              setContact((c) => ({ ...c, email: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <FieldLabel>Telefone</FieldLabel>
                          <TextInput
                            inputMode="numeric"
                            placeholder="(00) 00000-0000"
                            value={phoneFmt(contact.phone)}
                            onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                          />
                        </div>
                        <div>
                          <FieldLabel>CPF</FieldLabel>
                          <TextInput
                            inputMode="numeric"
                            placeholder="000.000.000-00"
                            value={cpfFmt(contact.cpf)}
                            onChange={(e) => setContact((c) => ({ ...c, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                          />
                          {(() => {
                            if (contact.cpf.length !== 11) return null;
                            const err = cpfValidationError(contact.cpf);
                            return err ? <p className="mt-1 text-xs text-red-500">{err}</p> : null;
                          })()}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                          Endereço
                        </p>
                        {addressFromLastOrder && (
                          <p className="text-[11px] text-stone-400">
                            Endereço preenchido com base na última compra. Confira antes de finalizar.
                          </p>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <FieldLabel>CEP</FieldLabel>
                          <TextInput
                            inputMode="numeric"
                            placeholder="00000-000"
                            value={cepMask(onlyDigits(address.destinationCep, 8))}
                            onChange={(e) => {
                              const digits = onlyDigits(e.target.value, 8);
                              setAddress((a) => ({ ...a, destinationCep: digits }));
                              setAddressFromLastOrder(false);
                              if (digits.length < 8) setCepLookupError(null);
                            }}
                          />
                          {cepLookupError && (
                            <p className="mt-1 text-xs text-red-500">{cepLookupError}</p>
                          )}
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel>Rua</FieldLabel>
                          <TextInput
                            value={address.street}
                            onChange={(e) => {
                              setAddressFromLastOrder(false);
                              setAddress((a) => ({ ...a, street: e.target.value }));
                            }}
                          />
                        </div>
                        <div>
                          <FieldLabel>Número</FieldLabel>
                          <TextInput
                            maxLength={ADDRESS_NUMBER_MAX_LENGTH}
                            value={address.number}
                            onChange={(e) => {
                              setAddressFromLastOrder(false);
                              setAddress((a) => ({
                                ...a,
                                number: e.target.value.slice(
                                  0,
                                  ADDRESS_NUMBER_MAX_LENGTH
                                ),
                              }));
                            }}
                          />
                          <p className="mt-1 text-[10px] text-stone-400">
                            Máx. {ADDRESS_NUMBER_MAX_LENGTH} caracteres
                          </p>
                        </div>
                        <div>
                          <FieldLabel optional>Complemento</FieldLabel>
                          <TextInput
                            maxLength={ADDRESS_COMPLEMENT_MAX_LENGTH}
                            value={address.complement}
                            onChange={(e) => {
                              setAddressFromLastOrder(false);
                              setAddress((a) => ({
                                ...a,
                                complement: e.target.value.slice(
                                  0,
                                  ADDRESS_COMPLEMENT_MAX_LENGTH
                                ),
                              }));
                            }}
                          />
                          <p className="mt-1 text-[10px] text-stone-400">
                            Máx. {ADDRESS_COMPLEMENT_MAX_LENGTH} caracteres
                          </p>
                        </div>
                        <div>
                          <FieldLabel>Bairro</FieldLabel>
                          <TextInput
                            value={address.neighborhood}
                            onChange={(e) => {
                              setAddressFromLastOrder(false);
                              setAddress((a) => ({ ...a, neighborhood: e.target.value }));
                            }}
                          />
                        </div>
                        <div>
                          <FieldLabel>Cidade</FieldLabel>
                          <TextInput
                            value={address.city}
                            onChange={(e) => {
                              setAddressFromLastOrder(false);
                              setAddress((a) => ({ ...a, city: e.target.value }));
                            }}
                          />
                        </div>
                        <div>
                          <FieldLabel>Estado</FieldLabel>
                          <TextInput
                            maxLength={2}
                            value={address.state}
                            onChange={(e) => {
                              setAddressFromLastOrder(false);
                              setAddress((a) => ({ ...a, state: e.target.value.toUpperCase() }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3 — Pagamento */}
            {step === 3 && (
              <div className="space-y-6">
                {canMarkAlreadyPaid ? (
                  <div className="space-y-2">
                    <CheckboxOption
                      checked={!paymentAlreadyPaid}
                      onChange={() => setPaymentAlreadyPaid(false)}
                      label="Aguardando pagamento"
                      description="Gerar link PIX ou cartão"
                    />
                    <CheckboxOption
                      checked={paymentAlreadyPaid}
                      onChange={() => setPaymentAlreadyPaid(true)}
                      label="Já foi pago"
                      description="Registrar pagamento manual"
                    />
                  </div>
                ) : null}

                <PaymentMethodSelector
                  paymentMethod={paymentMethod}
                  onChange={setPaymentMethod}
                  alreadyPaid={canMarkAlreadyPaid && paymentAlreadyPaid}
                />

                <div className="rounded-xl border border-stone-200 p-5">
                  <FieldLabel>Desconto na venda inteira</FieldLabel>
                  <div className="flex gap-2">
                    <select
                      value={orderDiscount?.mode ?? "FIXED"}
                      onChange={(e) =>
                        setOrderDiscount({
                          mode: e.target.value as "FIXED" | "PERCENT",
                          value: orderDiscount?.value ?? "",
                        })
                      }
                      className="rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                    >
                      <option value="FIXED">R$</option>
                      <option value="PERCENT">%</option>
                    </select>
                    <TextInput
                      inputMode="decimal"
                      placeholder="0"
                      value={orderDiscount?.value ?? ""}
                      onChange={(e) =>
                        setOrderDiscount({
                          mode: orderDiscount?.mode ?? "FIXED",
                          value: e.target.value,
                        })
                      }
                      className="max-w-[8rem]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Summary — desktop sidebar */}
          <aside className="hidden shrink-0 border-t border-stone-100 bg-stone-50/50 px-6 py-5 lg:block lg:w-72 lg:border-l lg:border-t-0">
            <OrderSummary
              pricing={pricingByMethod}
              paymentMethod={paymentMethod}
              maxInstallments={maxInstallments}
              shippingLabel={shippingLabel}
            />
          </aside>
        </div>

        {/* Summary — mobile sticky bar */}
        <div className="shrink-0 border-t border-stone-100 bg-stone-50 px-4 py-3 lg:hidden">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
              Total da venda
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`rounded-lg px-2.5 py-2 ${
                  paymentMethod === "pix"
                    ? "border border-sky-300 bg-sky-50"
                    : "border border-transparent bg-white/70"
                }`}
              >
                <div className="flex items-center gap-1">
                  <Image
                    src="/pix-icon.svg"
                    alt=""
                    width={12}
                    height={12}
                    unoptimized
                    className="h-3 w-3 shrink-0 object-contain"
                  />
                  <span className="text-[10px] font-medium text-stone-500">Pix</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-stone-900">
                  {pricingByMethod.pix ? formatPrice(pricingByMethod.pix.total) : "—"}
                </p>
              </div>
              <div
                className={`rounded-lg px-2.5 py-2 ${
                  paymentMethod === "card"
                    ? "border border-sky-300 bg-sky-50"
                    : "border border-transparent bg-white/70"
                }`}
              >
                <div className="flex items-center gap-1">
                  <svg
                    className="h-3 w-3 shrink-0 text-stone-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                  <span className="text-[10px] font-medium text-stone-500">Cartão</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-stone-900">
                  {pricingByMethod.card ? formatPrice(pricingByMethod.card.total) : "—"}
                </p>
                {pricingByMethod.card && maxInstallments > 0 && (
                  <p className="truncate text-[10px] tabular-nums text-stone-400">
                    {maxInstallments}×{" "}
                    {formatPrice(
                      installmentValueEqualParts(pricingByMethod.card.total, maxInstallments)
                    )}
                  </p>
                )}
              </div>
            </div>
            {activePricing &&
              activePricing.itemsDiscountTotal + activePricing.orderDiscountAmount > 0 && (
                <p className="text-xs text-red-600">
                  Desc. -
                  {formatPrice(
                    activePricing.itemsDiscountTotal + activePricing.orderDiscountAmount
                  )}
                </p>
              )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto flex shrink-0 items-center justify-between gap-3 border-t border-stone-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Voltar
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => setStep((s) => s + 1)}
              className="ml-auto rounded-lg bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-900 ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !canGoNext}
              onClick={() => void handleSubmit()}
              className="ml-auto rounded-lg bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-900 ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Criando…" : "Criar venda"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
