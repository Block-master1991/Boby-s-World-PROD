"use client";

import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { useCallback, useEffect, useState } from "react";

export const usePasskeyOnboarding = (
  isOpen: boolean,
  onClose: () => void,
  onPasskeyRegistered?: () => void
) => {
  const { registerPasskey: regHook } = useAuthContext();
  const { toast } = useToast();
  const [step, setStep] = useState<"intro" | "register" | "success">("intro");
  const [registering, setRegistering] = useState(false);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (isOpen) {
      setStep("intro");
      setDescription("");
    }
  }, [isOpen]);

  const registerPasskey = useCallback(async () => {
    if (!description.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a device description.",
      });
      return;
    }
    try {
      setRegistering(true);
      setStep("register");
      if (await regHook(description.trim())) {
        setStep("success");
        onPasskeyRegistered?.();
      } else setStep("intro");
    } catch (error) {
      logger.error("Error registering passkey:", error);
      setStep("intro");
    } finally {
      setRegistering(false);
    }
  }, [description, regHook, toast, onPasskeyRegistered]);

  return { step, registering, description, setDescription, registerPasskey, handleClose: onClose };
};
