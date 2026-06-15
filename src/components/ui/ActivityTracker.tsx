"use client";

/**
 * ActivityTracker is a no-op marker component.
 *
 * Activity tracking (mouse, keyboard, touch, visibility) is now centralized
 * inside `AuthProvider` so there is a single source of truth. This component
 * remains in the tree as a stable layout slot and as a future extension point
 * (e.g. telemetry beacons) — it intentionally does NOT attach DOM listeners.
 */
export const ActivityTracker = () => {
  return null;
};
