"use client";

import { ActivityTracker } from "./ActivityTracker";
import { SessionStatusBar } from "./SessionStatusBar";
import { SessionTimeoutWarning } from "./SessionTimeoutWarning";

/**
 * SessionManager — aggregates the session-related UI elements.
 *
 * The actual activity tracking and idle detection live in `AuthProvider` (a
 * single source of truth). This component only mounts the visual layers.
 */
export const SessionManager = () => {
  return (
    <>
      <ActivityTracker />
      <SessionStatusBar />
      <SessionTimeoutWarning />
    </>
  );
};
