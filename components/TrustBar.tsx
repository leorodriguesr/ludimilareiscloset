import { formatPrice } from "@/lib/format";

interface TrustBarProps {
  freeShippingEnabled?: boolean;
  freeShippingType?: string;
  freeShippingMinValue?: number;
}

export function TrustBar({
  freeShippingEnabled = false,
  freeShippingType = "minimum_value",
  freeShippingMinValue = 0,
}: TrustBarProps) {
  const shippingLabel = freeShippingEnabled
    ? "Frete grátis"
    : "Frete calculado";
  const shippingDetail = freeShippingEnabled
    ? freeShippingType === "always"
      ? "em todos os pedidos"
      : freeShippingMinValue > 0
      ? `acima de ${formatPrice(freeShippingMinValue)}`
      : "em todos os pedidos"
    : "no checkout pelo CEP";

  const items = [
    {
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
        </svg>
      ),
      label: shippingLabel,
      detail: shippingDetail,
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
        </svg>
      ),
      label: "6× sem juros",
      detail: "no cartão de crédito",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
      ),
      label: "Compra segura",
      detail: "dados criptografados",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
        </svg>
      ),
      label: "Troca fácil",
      detail: "até 30 dias",
    },
  ];

  return (
    <div className="w-full bg-stone-950">
      {/* Mobile: linha com scroll horizontal */}
      <div className="flex overflow-x-auto scrollbar-hide divide-x divide-stone-800 sm:hidden">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex shrink-0 items-center gap-2 px-4 py-3"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-800 text-stone-300">
              <span className="scale-75">{item.icon}</span>
            </span>
            <div className="whitespace-nowrap">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white">
                {item.label}
              </p>
              <p className="text-[10px] text-stone-500">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: grid de 4 colunas */}
      <div className="hidden sm:grid sm:grid-cols-4 divide-x divide-stone-800">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-row items-center justify-center gap-3 px-6 py-4 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-800 text-stone-300">
              {item.icon}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white">
                {item.label}
              </p>
              <p className="text-[11px] text-stone-500">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
