"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthContext } from "@/contexts/AuthContext";
import { useEffect, useRef, useState } from "react";

const WARNING_COUNTDOWN_SECONDS = 60; // hard cap the user gets after the warning fires

const formatTime = (seconds: number): string => {
  const s = Math.max(0, seconds);
  const minutes = Math.floor(s / 60);
  const secs = s % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
};

export const SessionTimeoutWarning = () => {
  const { userActivity, recordUserActivity, logoutAndRedirect, lastActive } = useAuthContext();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_COUNTDOWN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLoggedOutRef = useRef(false);

  // Open / close the modal based on the warning flag from the context.
  useEffect(() => {
    if (userActivity.idleWarningShown) {
      setShowWarning(true);
      setCountdown(WARNING_COUNTDOWN_SECONDS);
    } else {
      setShowWarning(false);
      hasLoggedOutRef.current = false;
    }
  }, [userActivity.idleWarningShown]);

  // Tick the countdown only while the warning is visible. The interval is
  // restarted whenever the warning toggles so it never drifts.
  useEffect(() => {
    if (!showWarning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [showWarning]);

  // Force logout when the countdown hits zero.
  useEffect(() => {
    if (!showWarning) return;
    if (countdown > 0) return;
    if (hasLoggedOutRef.current) return;
    hasLoggedOutRef.current = true;
    logoutAndRedirect("/");
  }, [countdown, showWarning, logoutAndRedirect]);

  const handleStayLoggedIn = () => {
    recordUserActivity();
    setShowWarning(false);
    setCountdown(WARNING_COUNTDOWN_SECONDS);
  };

  const handleLogoutNow = () => {
    setShowWarning(false);
    logoutAndRedirect("/");
  };

  // Avoid SSR/CSR mismatch on the very first render.
  if (!showWarning || lastActive === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
    >
      <Card className="mx-4 w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle id="session-timeout-title" className="text-xl text-red-600">
            Session about to expire
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="mb-4 text-gray-700">
            You will be logged out automatically due to inactivity.
          </p>
          <div className="mb-6">
            <span className="text-2xl font-bold tabular-nums text-red-500">
              {formatTime(countdown)}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={handleStayLoggedIn} className="flex-1">
              Continue playing
            </Button>
            <Button variant="outline" onClick={handleLogoutNow} className="flex-1">
              Log out now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
