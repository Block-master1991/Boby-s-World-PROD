# Session Management

## Overview

Centralized session and activity management in `AuthProvider`. Tracks user
interactions, extends the access-token window while the user is actively
playing, and automatically logs the user out after 15 minutes of inactivity.

## Architecture (single source of truth)

All activity listeners live in `src/contexts/AuthContext.tsx`. The visual
components (`SessionStatusBar`, `SessionTimeoutWarning`) are *consumers* —
they do not attach their own DOM listeners.

```
User interaction ──▶ AuthProvider (single set of listeners)
                         │
                         ├─▶ userActivity state (lastActive, isIdle, idleWarningShown)
                         ├─▶ isUserActive / timeUntilIdle (context value)
                         └─▶ idle / warning / logout timers

`apiFetch` ──▶ X-Active-Game: 1 header (for /api/game/*) ──▶ auth-middleware
                                                                  │
                                                                  ├─▶ isActiveUser = true
                                                                  ├─▶ never clear cookies on transient failures
                                                                  └─▶ +5 min access-token extension
```

## Key behaviors

| State                          | Trigger                              | Effect                                            |
| ------------------------------ | ------------------------------------ | ------------------------------------------------- |
| Active                         | Any mouse/keyboard/touch event       | No idle warning, no logout                        |
| Idle                           | 12 minutes of no activity            | `userActivity.isIdle = true` → `SessionStatusBar` |
| Warning                        | 14 minutes of no activity            | `SessionTimeoutWarning` modal with 60s countdown  |
| Auto-logout                    | 15 minutes of no activity            | `logoutAndRedirect("/")`                          |
| In-game token extension        | `X-Active-Game: 1` header on request | Access token TTL +5 min, cookies not cleared      |

## Files

| File                                            | Role                                                     |
| ----------------------------------------------- | -------------------------------------------------------- |
| `src/contexts/AuthContext.tsx`                  | Listens to events, owns activity state, schedules timers |
| `src/hooks/auth/useAuthCore.ts`                 | Polls session every 12 minutes                           |
| `src/lib/auth/auth-middleware.ts`               | Reads `X-Active-Game`, computes `isActiveUser`           |
| `src/lib/auth/jwt-utils.ts`                     | Extends access-token TTL for active users                |
| `src/utils/api.ts`                              | Adds `X-Active-Game: 1` to `/api/game/*` calls           |
| `src/components/ui/SessionManager.tsx`          | Mounts the visual components                             |
| `src/components/ui/ActivityTracker.tsx`         | No-op marker (extension point)                           |
| `src/components/ui/SessionStatusBar.tsx`       | Bottom-right status bar when idle                        |
| `src/components/ui/SessionTimeoutWarning.tsx`  | Modal warning before auto-logout                        |

## Tuning

All thresholds are constants at the top of `AuthContext.tsx`:

- `IDLE_THRESHOLD_MS = 12 * 60 * 1000` — when the user is marked idle
- `WARNING_THRESHOLD_MS = 14 * 60 * 1000` — when the warning modal appears
- `SESSION_TIMEOUT_MS = 15 * 60 * 1000` — hard cap before auto-logout

The active-game extension lives in `JWTManager.ACTIVE_USER_TOKEN_EXTENSION`
(5 minutes). Increase it if the access token's default 15-minute lifetime
is too short for long-running game sessions.
