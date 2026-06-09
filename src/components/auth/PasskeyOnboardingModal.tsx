"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthContext } from "@/contexts/AuthContext";
import { usePasskeyOnboarding } from "@/hooks/passkey/usePasskeyOnboarding";
import { useSecurityOnboarding } from "@/hooks/security/useSecurityOnboarding";
import { Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";
import { IntroStep, RegisterStep, SuccessStep } from "./PasskeyOnboardingSteps";

interface PasskeyOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasskeyRegistered?: () => void;
}

const getStepContent = (step: string) => {
  switch (step) {
    case "intro":
      return {
        title: "Secure Your Account",
        desc: "Choose a multi-factor authentication method to protect your account.",
      };
    case "register":
      return {
        title: "Registering Passkey...",
        desc: "Follow the prompts on your device to complete registration.",
      };
    case "success":
      return {
        title: "Passkey Registered!",
        desc: "Your account is now more secure with passkey authentication.",
      };
    default:
      return { title: "", desc: "" };
  }
};

export const PasskeyOnboardingModal: React.FC<PasskeyOnboardingModalProps> = ({
  isOpen,
  onClose,
  onPasskeyRegistered,
}) => {
  const router = useRouter();
  const { hasPasskey, totpEnabled } = useAuthContext();
  const { step, description, setDescription, registerPasskey, handleClose } = usePasskeyOnboarding(
    isOpen,
    onClose,
    onPasskeyRegistered
  );
  const { handleRemindLater, handleDismissPermanently } = useSecurityOnboarding();
  const { title, desc } = getStepContent(step);
  const isSecurityEnabled = hasPasskey || totpEnabled;

  const handleSetupTotp = () => {
    handleClose();
    // Redirect to security settings to set up TOTP
    router.push("/settings?tab=security");
  };

  const handleRemindLaterClick = () => {
    handleRemindLater();
    handleClose();
  };

  const handleDismissPermanentlyClick = () => {
    handleDismissPermanently();
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md border-none shadow-2xl rounded-3xl overflow-hidden">
        <DialogHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-2xl">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-black tracking-tight uppercase">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs font-medium leading-relaxed">
            {desc}
          </DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          {step === "intro" && (
            <IntroStep
              description={description}
              setDescription={setDescription}
              onClose={handleClose}
              onRegister={registerPasskey}
              onSetupTotp={handleSetupTotp}
              isSecurityEnabled={isSecurityEnabled}
              onRemindLater={handleRemindLaterClick}
              onDismissPermanently={handleDismissPermanentlyClick}
            />
          )}
          {step === "register" && <RegisterStep />}
          {step === "success" && <SuccessStep onClose={handleClose} />}
        </div>
      </DialogContent>
    </Dialog>
  );
};
