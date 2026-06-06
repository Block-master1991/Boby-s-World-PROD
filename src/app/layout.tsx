import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import RootLayoutClient from "./RootLayoutClient"; // Import the new client component

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env["NEXT_PUBLIC_APP_URL"] || "http://localhost:3000"),
  title: "Boby World",
  description: "An open-world dog adventure game on Solana.",
  icons: {
    icon: "/Boby-logo.png",
    shortcut: "/Boby-logo.png",
    apple: "/Boby-logo.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://www.google.com" />
        <link rel="preconnect" href="https://www.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://challenges.cloudflare.com" />
        <link rel="dns-prefetch" href="https://www.google.com" />
        <link rel="dns-prefetch" href="https://www.gstatic.com" />
        <link rel="dns-prefetch" href="https://challenges.cloudflare.com" />
        {/* Solana RPC Preconnect */}
        <link rel="preconnect" href="https://api.mainnet-beta.solana.com" />
        <link rel="dns-prefetch" href="https://api.mainnet-beta.solana.com" />
        {/* Firebase Preconnect */}
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
      </head>
      <body className={inter.className}>
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
