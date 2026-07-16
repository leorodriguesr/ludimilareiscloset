"use client";

import { useEffect, useMemo, useState } from "react";
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

type Props = { token: string };

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
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

export function CompleteAdminSaleDataForm({ token }: Props) {
  const [fulfillmentType, setFulfillmentType] = useState<"CARRIER" | "ARRANGED" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    destinationCep: "",
    addressStreet: "",
    addressNumber: "",
    addressComplement: "",
    addressNeighborhood: "",
    addressCity: "",
    addressState: "",
  });
  const [cepLookupError, setCepLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isArranged = fulfillmentType === "ARRANGED";

  const isComplete = useMemo(() => {
    if (isArranged) {
      return isCustomerNamePhoneComplete({
        name: form.name,
        phone: form.phone,
      });
    }
    return isCustomerContactAddressComplete({
      name: form.name,
      email: form.email,
      phone: form.phone,
      cpf: form.cpf,
      destinationCep: form.destinationCep,
      street: form.addressStreet,
      number: form.addressNumber,
      complement: form.addressComplement,
      neighborhood: form.addressNeighborhood,
      city: form.addressCity,
      state: form.addressState,
    });
  }, [form, isArranged]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/public/admin-sale/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Link inválido.");
        if (!cancelled) {
          setFulfillmentType(
            data.fulfillmentType === "ARRANGED" ? "ARRANGED" : "CARRIER"
          );
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Erro ao carregar.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (isArranged) return;
    const digits = onlyDigits(form.destinationCep, 8);
    if (digits.length !== 8) return;

    const timeout = setTimeout(() => {
      void (async () => {
        setCepLookupError(null);
        const result = await lookupAddressByCep(digits);
        if (!result.ok) {
          setCepLookupError(result.error);
          return;
        }
        setForm((current) => ({
          ...current,
          destinationCep: digits,
          addressStreet: result.address.street || current.addressStreet,
          addressNeighborhood:
            result.address.neighborhood || current.addressNeighborhood,
          addressCity: result.address.city || current.addressCity,
          addressState: result.address.state || current.addressState,
        }));
      })();
    }, 400);

    return () => clearTimeout(timeout);
  }, [form.destinationCep, isArranged]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isComplete) return;
    setLoading(true);
    setError(null);
    try {
      const body = isArranged
        ? { name: form.name, phone: form.phone }
        : form;
      const res = await fetch(`/api/public/admin-sale/${token}/customer-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao enviar.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <h2 className="text-lg font-semibold text-emerald-900">Dados enviados com sucesso!</h2>
        <p className="mt-2 text-sm text-emerald-700">
          Obrigada. Em breve entraremos em contato sobre sua compra.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {loadError}
      </div>
    );
  }

  if (fulfillmentType == null) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500">
        Carregando…
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-6 rounded-xl border border-stone-200 bg-white p-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-stone-900">Complete seus dados</h2>
        <p className="mt-1 text-sm text-stone-500">
          {isArranged
            ? "Informe seu nome e telefone para finalizarmos o atendimento."
            : "Preencha contato e endereço para finalizar sua compra."}
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {isArranged ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Nome</FieldLabel>
            <TextInput
              autoComplete="name"
              maxLength={CUSTOMER_NAME_MAX_LENGTH}
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
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
              autoComplete="tel"
              placeholder="(00) 00000-0000"
              value={phoneFmt(form.phone)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  phone: onlyDigits(e.target.value, 11),
                }))
              }
            />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Contato
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel>Nome completo</FieldLabel>
                <TextInput
                  autoComplete="name"
                  maxLength={CUSTOMER_NAME_MAX_LENGTH}
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
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
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <FieldLabel>Telefone</FieldLabel>
                <TextInput
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  value={phoneFmt(form.phone)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      phone: onlyDigits(e.target.value, 11),
                    }))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel>CPF</FieldLabel>
                <TextInput
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpfFmt(form.cpf)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cpf: onlyDigits(e.target.value, 11),
                    }))
                  }
                />
                {(() => {
                  if (form.cpf.length !== 11) return null;
                  const err = cpfValidationError(form.cpf);
                  return err ? <p className="mt-1 text-xs text-red-500">{err}</p> : null;
                })()}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Endereço
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>CEP</FieldLabel>
                <TextInput
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  value={cepMask(onlyDigits(form.destinationCep, 8))}
                  onChange={(e) => {
                    const digits = onlyDigits(e.target.value, 8);
                    setForm((f) => ({ ...f, destinationCep: digits }));
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
                  autoComplete="street-address"
                  value={form.addressStreet}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, addressStreet: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel>Número</FieldLabel>
                <TextInput
                  maxLength={ADDRESS_NUMBER_MAX_LENGTH}
                  value={form.addressNumber}
                  onChange={(e) =>
                    setForm((f) => ({
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
              </div>
              <div>
                <FieldLabel optional>Complemento</FieldLabel>
                <TextInput
                  maxLength={ADDRESS_COMPLEMENT_MAX_LENGTH}
                  value={form.addressComplement}
                  onChange={(e) =>
                    setForm((f) => ({
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
              </div>
              <div>
                <FieldLabel>Bairro</FieldLabel>
                <TextInput
                  value={form.addressNeighborhood}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, addressNeighborhood: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel>Cidade</FieldLabel>
                <TextInput
                  autoComplete="address-level2"
                  value={form.addressCity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, addressCity: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel>Estado</FieldLabel>
                <TextInput
                  maxLength={2}
                  autoComplete="address-level1"
                  value={form.addressState}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      addressState: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !isComplete}
        className="w-full rounded-lg bg-stone-900 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Enviando…" : "Enviar dados"}
      </button>
    </form>
  );
}
