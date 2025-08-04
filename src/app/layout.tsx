import type {Metadata} from 'next';
import './globals.css';
import '@solana/wallet-adapter-react-ui/styles.css'; // Added Solana wallet UI styles
import RootLayoutClient from './RootLayoutClient'; // Import the new client component

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
      <RootLayoutClient>
        {children}
      </RootLayoutClient>
    </html>
  );
}
