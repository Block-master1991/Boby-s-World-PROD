
import type {Metadata} from 'next';
import './globals.css';
import '@solana/wallet-adapter-react-ui/styles.css'; // Added Solana wallet UI styles
import { Toaster } from "@/components/ui/toaster";
import WalletContextProvider from '@/components/wallet/WalletContextProvider';
import { AuthProvider } from '@/contexts/AuthContext'; // Import AuthProvider

export const metadata: Metadata = {
  title: "Boby's World",
  description: 'An open-world dog adventure game on Solana.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet"></link>
      </head>
      <body className="font-body antialiased">
        <WalletContextProvider>
          <AuthProvider> {/* Wrap children with AuthProvider */}
            {children}
            <Toaster />
          </AuthProvider>
        </WalletContextProvider>
      </body>
    </html>
  );
}
