import { redirect } from "next/navigation";

/** Carrinho virou drawer; URL antiga redireciona para a loja. */
export default function CartPage() {
  redirect("/");
}
