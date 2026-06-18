import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/Header";
import { FooterGate } from "@/components/FooterGate";
import { AppProviders } from "@/components/providers/AppProviders";
import { GoogleOneTapGate } from "@/components/GoogleOneTapGate";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Ludimila Reis Closet | Moda Feminina",
  description:
    "Loja de moda feminina com peças selecionadas com estilo e elegância.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} antialiased`}>
      <body className="flex min-h-screen w-full min-w-0 flex-col bg-white font-sans text-stone-900">
        <AppProviders>
          <Header />
          <GoogleOneTapGate />
          <main className="min-w-0 w-full flex-1">{children}</main>
          <FooterGate />
        </AppProviders>
      </body>
    </html>
  );
}
