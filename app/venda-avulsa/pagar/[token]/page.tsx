import { AdminSalePixPaymentPage } from "@/components/admin-sale/AdminSalePixPaymentPage";
import { validatePaymentToken } from "@/lib/admin-sale/payment-page";

type PageProps = { params: Promise<{ token: string }> };

export default async function PagarVendaAvulsaPage({ params }: PageProps) {
  const { token } = await params;
  const validation = await validatePaymentToken(token);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#fafaf9_0%,_#f5f5f4_45%,_#e7e5e4_100%)] px-4 py-10">
      <div className="mx-auto max-w-md">
        {!validation.ok ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-sm text-red-700">{validation.error}</p>
          </div>
        ) : (
          <AdminSalePixPaymentPage token={token} />
        )}
      </div>
    </div>
  );
}
