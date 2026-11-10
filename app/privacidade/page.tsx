import type { Metadata } from "next";
import Link from "next/link";
import { WHATSAPP_URL } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Política de privacidade | Ludimila Reis Closet",
  description:
    "Como a Ludimila Reis Closet trata dados pessoais na loja, no WhatsApp e nos anúncios.",
};

const UPDATED_AT = "10 de novembro de 2026";
const CONTACT_EMAIL = "pedidos@ludimilareiscloset.com.br";

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-500">
        Ludimila Reis Closet
      </p>
      <h1 className="mt-3 text-3xl font-extralight tracking-tight text-stone-900">
        Política de privacidade
      </h1>
      <p className="mt-3 text-sm text-stone-500">Atualizada em {UPDATED_AT}.</p>

      <div className="mt-10 space-y-10 text-sm leading-relaxed text-stone-700">
        <section className="space-y-3">
          <p>
            Esta política explica quais dados pessoais a Ludimila Reis Closet
            coleta neste site, no atendimento pelo WhatsApp e no registro de
            vendas, e para que eles são usados. O tratamento segue a Lei Geral
            de Proteção de Dados (Lei nº 13.709/2018).
          </p>
          <p>
            A responsável pelo tratamento é a Ludimila Reis Closet, operadora
            da loja em{" "}
            <a
              href="https://ludimilareiscloset.com.br"
              className="underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
            >
              ludimilareiscloset.com.br
            </a>
            . Para falar sobre seus dados, use o e-mail{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            ou o{" "}
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
            >
              WhatsApp
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium text-stone-900">
            Dados que coletamos
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Conta: nome, e-mail, telefone e, quando você informa, CPF. Se
              entrar com o Google, recebemos o identificador da conta, o nome,
              o e-mail e a foto de perfil que o Google nos envia.
            </li>
            <li>
              Pedido: produtos, quantidades, valor, endereço de entrega, CEP,
              nome de quem recebe, telefone e CPF usados na nota e na
              transportadora.
            </li>
            <li>
              Pagamento: o cartão é processado pela InfinitePay e o Pix pelo
              Mercado Pago. Guardamos o identificador da transação, o meio de
              pagamento e a situação do pedido. O número completo do cartão não
              fica na loja.
            </li>
            <li>
              Entrega: dados do destinatário enviados à SuperFrete ou ao Melhor
              Envio para cotar o frete e gerar a etiqueta.
            </li>
            <li>
              WhatsApp e anúncios: quando a conversa começa a partir de um
              anúncio da Meta, guardamos o telefone e o identificador daquele
              clique. Se a venda avulsa desse contato for paga, enviamos à Meta
              o evento de compra, com valor e moeda, ligado a esse clique.
            </li>
            <li>
              Preferências da conta, como favoritos, e mensagens que você nos
              envia pelo WhatsApp para concluir um pedido.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium text-stone-900">
            Para que usamos
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Criar a conta, autenticar o acesso e mostrar os pedidos.</li>
            <li>
              Registrar a venda, cobrar, separar, enviar e prestar o
              atendimento da compra.
            </li>
            <li>
              Cumprir obrigações fiscais e de defesa do consumidor.
            </li>
            <li>
              Medir quais anúncios no WhatsApp geraram compra, para a Meta
              otimizar a campanha. Uma compra posterior, sem um clique novo no
              anúncio, não é enviada de novo.
            </li>
          </ul>
          <p>
            A base desse tratamento é a execução do pedido, o cumprimento de
            obrigação legal e o legítimo interesse de medir o resultado dos
            anúncios da própria loja. O login com Google depende da sua escolha
            de usar essa conta.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium text-stone-900">
            Com quem compartilhamos
          </h2>
          <p>
            Os dados seguem só para quem precisa participar da venda ou da
            operação da loja: InfinitePay, Mercado Pago, SuperFrete, Melhor
            Envio, Meta (somente o evento de compra ligado ao clique do
            anúncio), Google (quando o login é feito por lá) e os prestadores
            de hospedagem e banco de dados do site. Não vendemos dados
            pessoais.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium text-stone-900">
            Por quanto tempo guardamos
          </h2>
          <p>
            A conta fica enquanto você a mantiver. Pedidos e dados fiscais
            permanecem pelo prazo exigido pela legislação tributária e pelo
            Código de Defesa do Consumidor. O identificador do clique do
            anúncio é usado para um único evento de compra e fica associado a
            esse pedido.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium text-stone-900">
            Cookies e sessão
          </h2>
          <p>
            Usamos um cookie de sessão para manter você conectada. Ele não
            serve para anúncio dentro do site. A medição da campanha acontece
            no servidor, a partir da conversa que veio do anúncio, e não por um
            pixel no navegador.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium text-stone-900">Seus direitos</h2>
          <p>
            Você pode pedir confirmação do tratamento, acesso, correção,
            anonimização, portabilidade ou exclusão dos dados, além de
            informação sobre com quem eles foram compartilhados. Também pode
            se opor a um tratamento feito com base no legítimo interesse.
            Envie o pedido pelo e-mail ou pelo WhatsApp indicados acima.
          </p>
          <p>
            Se a resposta não resolver a solicitação, é possível registrar
            reclamação na Autoridade Nacional de Proteção de Dados (
            <a
              href="https://www.gov.br/anpd"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
            >
              gov.br/anpd
            </a>
            ).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium text-stone-900">
            Alterações desta política
          </h2>
          <p>
            Quando esta página mudar, a data do topo é atualizada. O uso da
            loja depois da publicação da nova versão indica que você está
            ciente do texto vigente.
          </p>
          <p>
            <Link
              href="/"
              className="underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
            >
              Voltar para a loja
            </Link>
          </p>
        </section>
      </div>
    </article>
  );
}
