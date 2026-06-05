"use client";

import { TwoFactorManagement } from "@/components/auth/TwoFactorManagement";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/contexts/AuthContext";
import { ArrowLeft, Dog, Loader2, Lock, Settings, Shield, User } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

// ─── Tab config ────────────────────────────────────────────────────────────
type TabId = "security" | "account";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "security", label: "Security", icon: <Shield size={16} /> },
  { id: "account", label: "Account", icon: <User size={16} /> },
];

// ─── Sidebar tab list ───────────────────────────────────────────────────────
function SidebarNav({ active, onSelect }: { active: TabId; onSelect: (t: TabId) => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`
                        flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-left
                        ${
                          active === t.id
                            ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                        }
                    `}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// ─── Mobile horizontal tab bar ─────────────────────────────────────────────
function MobileTabs({ active, onSelect }: { active: TabId; onSelect: (t: TabId) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`
                        flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border
                        ${
                          active === t.id
                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                            : "bg-muted/40 text-muted-foreground border-muted hover:bg-muted/70"
                        }
                    `}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Content per tab ────────────────────────────────────────────────────────
function SecurityTab() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 bg-primary/10 rounded-xl">
          <Lock size={18} className="text-primary" />
        </div>
        <div>
          <h2 className="text-base font-black tracking-tight">Two-Factor Authentication</h2>
          <p className="text-xs text-muted-foreground">
            Google Authenticator · Passkeys · Backup Codes
          </p>
        </div>
      </div>
      <TwoFactorManagement />
    </div>
  );
}

function AccountTab() {
  return (
    <div className="py-16 flex flex-col items-center text-center text-muted-foreground gap-3">
      <Settings size={36} className="opacity-20" />
      <p className="text-sm font-medium">Account settings coming soon.</p>
    </div>
  );
}

// ─── Not-signed-in state ────────────────────────────────────────────────────
function NotAuthenticated() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center space-y-5 max-w-sm">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
          <Lock size={28} className="text-primary" />
        </div>
        <h2 className="text-xl font-black">Sign In Required</h2>
        <p className="text-sm text-muted-foreground">
          You need to be signed in to access settings.
        </p>
        <Link href="/">
          <Button className="w-full gap-2">
            <ArrowLeft size={16} /> Go to Game
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Inner component (reads searchParams) ───────────────────────────────────
function SettingsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthContext();

  const tabParam = searchParams.get("tab") as TabId | null;
  const validTabs: TabId[] = ["security", "account"];
  const defaultTab: TabId = tabParam && validTabs.includes(tabParam) ? tabParam : "security";

  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  // Keep URL in sync with selected tab
  const handleSelect = (tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/settings?tab=${tab}`, { scroll: false });
  };

  // If tab param changes externally (browser back/forward), sync state
  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary/40" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <NotAuthenticated />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Back to game">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft size={16} />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Dog size={18} className="text-primary" />
              <span className="text-sm font-black tracking-tight">Boby World</span>
              <span className="text-muted-foreground/40 text-sm">/</span>
              <span className="text-sm font-semibold text-muted-foreground">Settings</span>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <div className="md:hidden sticky top-14 z-30 bg-background/90 backdrop-blur-md border-b border-border/30 px-4 py-2">
        <MobileTabs active={activeTab} onSelect={handleSelect} />
      </div>

      {/* Page body */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Sidebar – desktop only */}
          <aside className="hidden md:block w-48 shrink-0">
            <div className="sticky top-24 space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2 px-4">
                  Settings
                </p>
                <SidebarNav active={activeTab} onSelect={handleSelect} />
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {/* Page heading */}
            <div className="mb-8">
              <h1 className="text-2xl font-black tracking-tight">
                {TABS.find(t => t.id === activeTab)?.label}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {activeTab === "security"
                  ? "Protect your account with multi-factor authentication."
                  : "Manage your account preferences."}
              </p>
            </div>

            {/* Tab panels */}
            <div
              className="
                            rounded-2xl border border-border/50
                            bg-card/60 backdrop-blur-sm shadow-sm
                            p-6 sm:p-8
                        "
            >
              {activeTab === "security" && <SecurityTab />}
              {activeTab === "account" && <AccountTab />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

// ─── Exported default with Suspense (required for useSearchParams) ───────────
export default function SettingsPageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-primary/40" />
        </div>
      }
    >
      <SettingsInner />
    </Suspense>
  );
}
