import type { Metadata } from "next";
import "./globals.css";
import { ConfirmProvider } from "../components/confirm-dialog";

export const metadata: Metadata = {
  title: "TURESMA",
  description: "Sistema de transporte turistico y corporativo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body suppressHydrationWarning>
        <ConfirmProvider>{children}</ConfirmProvider>
      </body>
    </html>
  );
}
