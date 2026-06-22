import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://custody-zeta.vercel.app"),
  title: "Custody control room",
  description:
    "Globally-consistent parental-consent and minor-spend-control ledger on Amazon Aurora DSQL.",
  openGraph: {
    title: "Custody",
    description:
      "Strongly consistent parental consent and minor-spend control across regions, on Amazon Aurora DSQL.",
    url: "https://custody-zeta.vercel.app",
    siteName: "Custody",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Custody",
    description:
      "Strongly consistent parental consent and minor-spend control across regions, on Amazon Aurora DSQL.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="scanlines min-h-screen antialiased">{children}</body>
    </html>
  );
}
