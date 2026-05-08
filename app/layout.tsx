import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"]
});

export const metadata: Metadata = {
  title: "Versorgungs-Dashboard",
  description: "Ein kleines internes CRM fuer 1-3 Nutzer."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
