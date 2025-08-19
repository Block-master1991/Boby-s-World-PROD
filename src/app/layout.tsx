import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import '@solana/wallet-adapter-react-ui/styles.css'; // Added Solana wallet UI styles
import RootLayoutClient from './RootLayoutClient'; // Import the new client component

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: "Boby World",
  description: 'An open-world dog adventure game on Solana.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
