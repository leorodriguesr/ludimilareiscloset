import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/Header";
import { FooterGate } from "@/components/FooterGate";
import { AppProviders } from "@/components/providers/AppProviders";
import { GoogleOneTapGate } from "@/components/GoogleOneTapGate";
import { PwaRegister } from "@/components/PwaRegister";
import { WhatsAppButtonGate } from "@/components/WhatsAppButtonGate";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Ludimila Reis Closet | Moda Feminina",
  description:
    "Loja de moda feminina com peças selecionadas com estilo e elegância.",
  applicationName: "Ludimila Reis Closet",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LR Closet",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon-lr.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1c1917",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
          <PwaRegister />
          <Header />
          <GoogleOneTapGate />
          <main className="min-w-0 w-full flex-1">{children}</main>
          <FooterGate />
          <WhatsAppButtonGate />
        </AppProviders>
      </body>
    </html>
  );
}
