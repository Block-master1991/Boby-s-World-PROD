"use client";

import { useAuthContext } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";

const SESSION_TOTAL_MS = 15 * 60 * 1000;
const RED_THRESHOLD_MS = 60 * 1000; // < 1 min left
const YELLOW_THRESHOLD_MS = 5 * 60 * 1000; // < 5 min left

const formatTime = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

interface SessionStatus {
  text: string;
  textColor: string;
  bgColor: string;
  progress: number;
}

const computeStatus = (timeUntilIdle: number, isUserActive: boolean): SessionStatus => {
  if (isUserActive) {
    return {
      text: "Active session",
      textColor: "text-green-700",
      bgColor: "bg-green-50 border-green-200",
      progress: 100,
    };
  }
  if (timeUntilIdle <= 0) {
    return { text: "Session expired", textColor: "text-red-700", bgColor: "bg-red-50 border-red-200", progress: 0 };
  }
  if (timeUntilIdle < RED_THRESHOLD_MS) {
    return {
      text: "Session expiring soon",
      textColor: "text-red-700",
      bgColor: "bg-red-50 border-red-200",
      progress: (timeUntilIdle / SESSION_TOTAL_MS) * 100,
    };
  }
  if (timeUntilIdle < YELLOW_THRESHOLD_MS) {
    return {
      text: "Session about to expire",
      textColor: "text-yellow-800",
      bgColor: "bg-yellow-50 border-yellow-200",
      progress: (timeUntilIdle / SESSION_TOTAL_MS) * 100,
    };
  }
  return {
    text: "Idle session",
    textColor: "text-gray-700",
    bgColor: "bg-gray-50 border-gray-200",
    progress: (timeUntilIdle / SESSION_TOTAL_MS) * 100,
  };
};

export const SessionStatusBar = () => {
  const { timeUntilIdle, isUserActive, userActivity } = useAuthContext();
  const [tick, setTick] = useState(0);

  // Local 1Hz tick — re-renders the countdown without relying on the
  // context value (which only updates when activity changes).
  useEffect(() => {
    if (isUserActive) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isUserActive]);

  // Don't render until client-side hydration is complete — avoids SSR/CSR
  // mismatch on a server that has no `lastActive` value.
  if (userActivity.lastActive === 0) return null;
  if (isUserActive) return null;

  const status = computeStatus(timeUntilIdle, false);

  return (
    <Card
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 left-4 right-4 z-40 p-3 ${status.bgColor} border shadow-lg transition-all duration-300 sm:left-auto sm:right-4 sm:w-96`}
      data-tick={tick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div
            className={`h-3 w-3 rounded-full ${
              status.textColor === "text-red-700" ? "bg-red-500" : "bg-yellow-500"
            }`}
          />
          <span className={`font-medium ${status.textColor}`}>{status.text}</span>
        </div>
        <div className="text-sm tabular-nums text-gray-600">{formatTime(timeUntilIdle)}</div>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${
            status.textColor === "text-red-700" ? "bg-red-500" : "bg-yellow-500"
          }`}
          style={{ width: `${Math.max(0, status.progress)}%` }}
        />
      </div>
    </Card>
  );
};
