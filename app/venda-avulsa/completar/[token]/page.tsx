import { CompleteAdminSaleDataForm } from "@/components/admin-sale/CompleteAdminSaleDataForm";
import { validateCustomerDataToken } from "@/lib/admin-sale/complete-customer-data";

type PageProps = { params: Promise<{ token: string }> };

export default async function CompletarDadosPage({ params }: PageProps) {
  const { token } = await params;
  const validation = await validateCustomerDataToken(token);

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        {!validation.ok ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-sm text-red-700">{validation.error}</p>
          </div>
        ) : (
          <CompleteAdminSaleDataForm token={token} />
        )}
      </div>
    </div>
  );
}
