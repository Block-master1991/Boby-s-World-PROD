import { PWAInstallButton } from '@/components/shared/PWAInstallButton';
import { Button } from '@/components/ui/button';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import type { PublicKey } from '@solana/web3.js';
import { AlertTriangle, Fingerprint, LogOutIcon, PawPrint, RefreshCw, ShieldCheck, Smartphone, Wallet, Zap } from 'lucide-react';
import Image from 'next/image';
import React from 'react';

interface CommonProps {
    isMobile: boolean;
}

// --- Sub-components for GuestView to reduce complexity ---

const QuickLaunchCard: React.FC<{ loginWithPasskey: () => void }> = ({ loginWithPasskey }) => (
    <div className="p-6 bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-3xl backdrop-blur-sm shadow-xl shadow-primary/5">
        <div className="flex items-center gap-4 text-left">
            <div className="bg-primary/20 p-3 rounded-2xl shadow-inner">
                <Fingerprint className="w-6 h-6 text-primary animate-pulse" />
            </div>
            <div className="flex-1">
                <h3 className="text-sm font-bold tracking-tight">Quick Launch</h3>
                <p className="text-[11px] text-muted-foreground leading-tight">App installed. Enter Boby World instantly using biometrics.</p>
            </div>
            <Button
                onClick={() => loginWithPasskey()}
                className="rounded-full px-6 bg-primary text-primary-foreground hover:scale-105 transition-transform shadow-lg shadow-primary/20 text-xs font-bold"
            >
                SIGN IN
            </Button>
        </div>
    </div>
);

const ConnectWalletSection: React.FC<{ hasPasskey: boolean; loginWithPasskey: () => void }> = ({ hasPasskey, loginWithPasskey }) => (
    <div className="flex flex-col items-center gap-4">
        <div className="w-full flex justify-center">
            <WalletMultiButton
                style={{
                    backgroundColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    fontSize: '1rem',
                    fontWeight: '600',
                    padding: '0.75rem 2rem',
                    borderRadius: '0.75rem',
                    height: 'auto',
                    width: '100%',
                    maxWidth: '280px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    transition: 'all 0.2s ease-in-out',
                    boxShadow: '0 4px 15px -1px rgba(var(--primary), 0.3)'
                }}
            />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-[280px]">
            {hasPasskey && (
                <Button
                    variant="secondary"
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white border-slate-700"
                    onClick={loginWithPasskey}
                >
                    <ShieldCheck className="h-4 w-4 mr-2 text-green-400" />
                    Biometric Login
                </Button>
            )}
            <Button
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground text-xs"
                onClick={() => {
                    if (typeof window !== 'undefined') {
                        localStorage.removeItem('walletName');
                        window.location.reload();
                    }
                }}
            >
                <RefreshCw className="h-3 w-3 mr-2" />
                Reset Wallet
            </Button>
        </div>
    </div>
);

const MobileTips: React.FC = () => (
    <div className="bg-secondary/10 p-4 rounded-2xl border border-secondary/20 text-left">
        <div className="flex items-center gap-2 mb-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <span className="font-bold text-xs uppercase tracking-tight">Mobile Tips</span>
        </div>
        <ul className="text-[10px] text-muted-foreground space-y-1">
            <li>• Use Phantom or Solflare for the smoothest experience.</li>
            <li>• You'll be redirected to your wallet app to sign.</li>
            <li>• Return to this tab once the signature is complete.</li>
        </ul>
    </div>
);

// --- Main Views ---

export const LoadingView: React.FC<CommonProps & { onRequestDisconnect: () => Promise<void> }> = ({ isMobile, onRequestDisconnect }) => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
        <div className="relative mb-8">
            <Image src="/Boby-logo.png" alt="Boby World Loading" width={180} height={180} className="rounded-md opacity-80" priority />
        </div>
        <PawPrint className="h-12 w-12 animate-pulse text-primary mb-4" />
        <h1 className="text-4xl font-bold mb-2 font-headline">Boby World</h1>
        <p className="text-xl text-muted-foreground">Processing authentication...</p>
        <p className="text-sm text-muted-foreground mt-4 text-center max-w-xs">
            {isMobile ? 'Check your wallet app if prompted for approval. Connection may take longer on mobile.' : 'Please wait. If prompted, check your wallet.'}
        </p>
        {isMobile && (
            <Button onClick={onRequestDisconnect} variant="outline" size="sm" className="mt-4">
                <LogOutIcon className="mr-2 h-4 w-4" /> Cancel & Disconnect Wallet
            </Button>
        )}
    </div>
);

interface GuestViewProps extends CommonProps {
    isPWA: boolean;
    hasPasskey: boolean;
    isAuthenticated: boolean;
    loginWithPasskey: () => void;
}

export const GuestView: React.FC<GuestViewProps> = ({ isMobile, isPWA, hasPasskey, isAuthenticated, loginWithPasskey }) => (
    <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-1000 space-y-8">
        {isPWA && hasPasskey && !isAuthenticated && (
            <QuickLaunchCard loginWithPasskey={loginWithPasskey} />
        )}

        <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-primary/60">
                <Wallet className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-widest">Connect Wallet</span>
            </div>
            <p className="text-xl text-muted-foreground max-w-sm mx-auto">
                Your journey begins here. Connect to unlock the world.
            </p>
        </div>

        <ConnectWalletSection hasPasskey={hasPasskey} loginWithPasskey={loginWithPasskey} />
        {isMobile && <MobileTips />}
    </div>
);

interface ConnectedMismatchProps {
    walletPublicKey: PublicKey;
    userPublicKey: string;
    onLoginAttempt: () => Promise<void>;
    onRequestDisconnect: () => Promise<void>;
}

export const WalletMismatchView: React.FC<ConnectedMismatchProps> = ({ walletPublicKey, userPublicKey, onLoginAttempt, onRequestDisconnect }) => (
    <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-1000 space-y-6">
        <p className="text-xl text-muted-foreground max-w-md mx-auto">
            Wallet <span className="font-semibold text-primary">{walletPublicKey.toBase58().substring(0, 4)}...{walletPublicKey.toBase58().substring(walletPublicKey.toBase58().length - 4)}</span> connected.
        </p>
        <div className="space-y-4">
            <p className="text-lg text-destructive">
                <AlertTriangle className="inline-block mr-2 h-5 w-5" />
                Authenticated as <span className="font-semibold text-destructive">{userPublicKey.substring(0, 4)}...{userPublicKey.substring(userPublicKey.length - 4)}</span>, but a different wallet is connected.
            </p>
            <p className="text-md text-muted-foreground">
                Please disconnect the current wallet and connect with your authenticated wallet, or log in with the current wallet.
            </p>
            <Button onClick={onLoginAttempt} className="w-full max-w-sm" size="lg">
                <ShieldCheck className="mr-2 h-5 w-5" /> Authenticate with Current Wallet
            </Button>
        </div>
        <Button onClick={onRequestDisconnect} variant="ghost" className="text-muted-foreground">
            <LogOutIcon className="mr-2 h-4 w-4" /> Disconnect Wallet
        </Button>
    </div>
);

interface SignInViewProps extends CommonProps {
    walletPublicKey: PublicKey;
    onLoginAttempt: () => Promise<void>;
    onRequestDisconnect: () => Promise<void>;
}

import { useRouter } from 'next/navigation';

// ... (previous imports)

// ... (other components)

export const SignInView: React.FC<SignInViewProps> = ({ isMobile, walletPublicKey, onLoginAttempt, onRequestDisconnect }) => {
    const router = useRouter();

    return (
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-1000 space-y-6">
            <p className="text-xl text-muted-foreground max-w-md mx-auto">
                Wallet <span className="font-semibold text-primary">{walletPublicKey.toBase58().substring(0, 4)}...{walletPublicKey.toBase58().substring(walletPublicKey.toBase58().length - 4)}</span> connected.
            </p>
            <div className="flex flex-col items-center gap-4">
                <p className="text-lg text-muted-foreground max-w-md mx-auto">
                    <ShieldCheck className="inline-block mr-2 h-5 w-5 text-primary" />
                    Wallet connected. Please sign in to verify ownership.
                </p>
                <Button onClick={onLoginAttempt} className="w-full max-w-sm animate-pulse hover:animate-none shadow-lg shadow-primary/20" size="lg">
                    <PawPrint className="mr-2 h-5 w-5" /> Sign In with Wallet
                </Button>
                {isMobile && (
                    <p className="text-xs text-muted-foreground">
                        This will open your wallet app to sign a message.
                    </p>
                )}
            </div>
            
            <div className="text-center mt-4">
                <button 
                    onClick={() => router.push('/auth/recovery')}
                    className="text-xs text-muted-foreground hover:text-primary underline"
                >
                    Having trouble signing in?
                </button>
            </div>

            <Button onClick={onRequestDisconnect} variant="ghost" className="text-muted-foreground">
                <LogOutIcon className="mr-2 h-4 w-4" /> Disconnect Wallet
            </Button>
        </div>
    );
};

interface AuthenticatedViewProps {
    userPublicKey: string;
    hasPasskey: boolean;
}

export const AuthenticatedView: React.FC<AuthenticatedViewProps> = ({ userPublicKey, hasPasskey }) => (
    <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-1000 space-y-6">
        <p className="text-xl text-muted-foreground max-w-md mx-auto">
            You are logged in as <span className="font-semibold text-primary">{userPublicKey.substring(0, 4)}...{userPublicKey.substring(userPublicKey.length - 4)}</span>.
        </p>
        <div className="flex flex-col items-center gap-6">
            <p className="text-lg text-muted-foreground">
                Ready to enter Boby World!
            </p>

            <div className="w-full flex justify-center">
                <PWAInstallButton
                    variant="button"
                    showOnlyOnMobile={true}
                    className="w-full max-w-xs"
                />
            </div>

            {!hasPasskey && (
                <div className="p-5 bg-primary/5 rounded-3xl border border-primary/10 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center gap-2 mb-2 text-primary font-bold text-xs uppercase tracking-tighter justify-center">
                        <Zap size={14} className="fill-primary text-primary" />
                        Security Upgrade Available
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Register this device as a <b>Passkey</b> in the Game Menu to enable <b>Biometric Login</b>. This skips wallet signatures and protects your account with Maximum-grade security.
                    </p>
                </div>
            )}
        </div>
    </div>
);
