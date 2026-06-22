import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
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
  manifest: "/manifest.webmanifest",
  applicationName: "Custody",
  appleWebApp: {
    capable: true,
    title: "Custody",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#131519",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="scanlines min-h-screen antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
