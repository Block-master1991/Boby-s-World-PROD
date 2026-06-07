"use client";

import { useAuthContext } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";

const STORAGE_KEYS = {
  FIRST_LOGIN: "security_onboarding_first_login",
  DISMISSED: "security_onboarding_dismissed",
  REMIND_LATER: "security_onboarding_remind_later",
  DISMISSED_PERMANENTLY: "security_onboarding_dismissed_permanently",
} as const;

const REMIND_LATER_DAYS = 1;
const REMIND_LATER_MS = REMIND_LATER_DAYS * 24 * 60 * 60 * 1000;

export const useSecurityOnboarding = () => {
  const { isAuthenticated, hasPasskey, totpEnabled, isLoading } = useAuthContext();
  const [showModal, setShowModal] = useState(false);
  const [canShow, setCanShow] = useState(false);

  const isSecurityEnabled = hasPasskey || totpEnabled;

  useEffect(() => {
    if (isLoading) return;

    // Don't show if security is already enabled
    if (isSecurityEnabled) {
      setShowModal(false);
      setCanShow(false);
      return;
    }

    // Check if permanently dismissed
    const dismissedPermanently = localStorage.getItem(STORAGE_KEYS.DISMISSED_PERMANENTLY);
    if (dismissedPermanently === "true") {
      setCanShow(false);
      return;
    }

    // Check remind later
    const remindLater = localStorage.getItem(STORAGE_KEYS.REMIND_LATER);
    if (remindLater) {
      const remindTime = parseInt(remindLater);
      const now = Date.now();
      if (now - remindTime < REMIND_LATER_MS) {
        setCanShow(false);
        return;
      }
    }

    // Check if dismissed before
    const dismissed = localStorage.getItem(STORAGE_KEYS.DISMISSED);
    if (dismissed === "true") {
      setCanShow(false);
      return;
    }

    // Check first login
    const firstLogin = localStorage.getItem(STORAGE_KEYS.FIRST_LOGIN);
    if (!firstLogin) {
      // First time login - show modal
      localStorage.setItem(STORAGE_KEYS.FIRST_LOGIN, Date.now().toString());
      setCanShow(true);
    } else {
      // Not first login, check if should show
      const loginTime = parseInt(firstLogin);
      const now = Date.now();
      // Show only if within 24 hours of first login
      if (now - loginTime < 24 * 60 * 60 * 1000) {
        setCanShow(true);
      } else {
        setCanShow(false);
      }
    }
  }, [isLoading, isSecurityEnabled]);

  // Show modal when authenticated and can show
  useEffect(() => {
    if (isAuthenticated && canShow && !isSecurityEnabled) {
      setShowModal(true);
    } else {
      setShowModal(false);
    }
  }, [isAuthenticated, canShow, isSecurityEnabled]);

  const handleDismiss = () => {
    setShowModal(false);
    localStorage.setItem(STORAGE_KEYS.DISMISSED, "true");
  };

  const handleRemindLater = () => {
    setShowModal(false);
    localStorage.setItem(STORAGE_KEYS.REMIND_LATER, Date.now().toString());
  };

  const handleDismissPermanently = () => {
    setShowModal(false);
    localStorage.setItem(STORAGE_KEYS.DISMISSED_PERMANENTLY, "true");
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEYS.FIRST_LOGIN);
    localStorage.removeItem(STORAGE_KEYS.DISMISSED);
    localStorage.removeItem(STORAGE_KEYS.REMIND_LATER);
    localStorage.removeItem(STORAGE_KEYS.DISMISSED_PERMANENTLY);
    setCanShow(true);
  };

  return {
    showModal,
    handleDismiss,
    handleRemindLater,
    handleDismissPermanently,
    handleReset,
    isSecurityEnabled,
  };
};
