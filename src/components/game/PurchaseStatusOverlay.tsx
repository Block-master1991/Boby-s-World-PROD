'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { PurchasePhase, PurchaseProgress } from '@/lib/solanaPaymentService';
import { CheckCircle2, ExternalLink, Loader2, Send, Shield, XCircle } from 'lucide-react';
import React from 'react';

interface PurchaseStatusOverlayProps {
    progress: PurchaseProgress;
    onClose?: () => void;
}

const phaseConfig: Record<PurchasePhase, {
    icon: React.ReactNode;
    title: string;
    color: string;
}> = {
    idle: { icon: null, title: '', color: 'text-muted-foreground' },
    preparing: { icon: <Loader2 className="h-8 w-8 animate-spin" />, title: 'Preparing Transaction', color: 'text-blue-500' },
    awaiting_signature: { icon: <Shield className="h-8 w-8 animate-pulse" />, title: 'Awaiting Signature', color: 'text-yellow-500' },
    sending: { icon: <Send className="h-8 w-8 animate-bounce" />, title: 'Sending', color: 'text-blue-500' },
    confirming: { icon: <Loader2 className="h-8 w-8 animate-spin" />, title: 'Confirming Transaction', color: 'text-orange-500' },
    verifying: { icon: <Shield className="h-8 w-8 animate-pulse" />, title: 'Verifying with Server', color: 'text-purple-500' },
    complete: { icon: <CheckCircle2 className="h-8 w-8" />, title: 'Success!', color: 'text-green-500' },
    error: { icon: <XCircle className="h-8 w-8" />, title: 'Error Occurred', color: 'text-red-500' },
};

const phases: PurchasePhase[] = ['preparing', 'awaiting_signature', 'sending', 'confirming', 'verifying', 'complete'];

const StatusHeader: React.FC<{ phase: PurchasePhase; message: string }> = ({ phase, message }) => {
    const config = phaseConfig[phase];
    return (
        <>
            <div className={`flex justify-center mb-4 ${config.color}`}>{config.icon}</div>
            <h2 className={`text-xl font-bold text-center mb-2 ${config.color}`}>{config.title}</h2>
            <p className="text-center text-muted-foreground mb-6">{message}</p>
        </>
    );
};

const StatusStepper: React.FC<{ phase: PurchasePhase }> = ({ phase }) => {
    const currentIndex = phases.indexOf(phase);
    return (
        <div className="mb-6">
            <div className="flex justify-between items-center mb-6">
                {phases.slice(0, -1).map((p, index) => {
                    const isActive = index === currentIndex;
                    const isComplete = index < currentIndex || phase === 'complete';
                    const isError = phase === 'error' && index === currentIndex;
                    return (
                        <React.Fragment key={p}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${isComplete ? 'bg-green-500 text-white' : isActive ? 'bg-primary text-primary-foreground animate-pulse' : isError ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                                {isComplete ? '✓' : index + 1}
                            </div>
                            {index < phases.length - 2 && (
                                <div className={`flex-1 h-1 mx-1 rounded transition-all duration-300 ${index < currentIndex ? 'bg-green-500' : 'bg-muted'}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                <span>Setup</span><span>Sign</span><span>Send</span><span>Confirm</span><span>Verify</span>
            </div>
        </div>
    );
};

const StatusActions: React.FC<{ progress: PurchaseProgress; onClose?: (() => void) | undefined }> = ({ progress, onClose }) => (
    <>
        {progress.explorerUrl && (
            <a href={progress.explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-sm text-primary hover:underline mb-4">
                <ExternalLink className="h-4 w-4" /> View on Solscan
            </a>
        )}
        {progress.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                <p className="text-red-500 text-sm text-center">{progress.error}</p>
            </div>
        )}
        {(progress.phase === 'complete' || progress.phase === 'error') && onClose && (
            <button onClick={onClose} className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                {progress.phase === 'complete' ? 'Done' : 'Close'}
            </button>
        )}
    </>
);

export const PurchaseStatusOverlay: React.FC<PurchaseStatusOverlayProps> = ({ progress, onClose }) => {
    if (progress.phase === 'idle') return null;
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-card/95 border-primary/20">
                <CardContent className="p-6">
                    <StatusHeader phase={progress.phase} message={progress.message} />
                    <StatusStepper phase={progress.phase} />
                    <StatusActions progress={progress} onClose={onClose} />
                </CardContent>
            </Card>
        </div>
    );
};

export default PurchaseStatusOverlay;
