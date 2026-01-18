'use client';

import { AdminContent } from '@/components/admin/AdminContent';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminAccessDeniedScreen, AdminLoadingScreen } from '@/components/admin/AdminStatusScreens';
import { SecurityBanner } from '@/components/auth/SecurityBanner';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useAdminDashboardData } from '@/hooks/useAdminDashboardData';
import { useAdminRouting } from '@/hooks/useAdminRouting';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { BarChart3, FileText, Home, Package, Settings, Shield, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useRef, useState } from 'react';

const MENU_ITEMS = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'items', label: 'Items', icon: Package },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'logs', label: 'Audit Logs', icon: FileText },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function AdminPage() {
  const { isAuthenticated, isAuthHookLoading, user, logoutAuthHook, isAdmin } = useAdminRouting();
  const { disconnectFromSession } = useSessionWallet();
  const router = useRouter();
  const topRef = useRef<HTMLDivElement>(null);
  
  const [activeSection, setActiveSection] = useState('overview');
  // Pass explicit boolean to hook to fix potential "undefined" issues
  const shouldFetch = Boolean(isAuthenticated && isAdmin);
  const dashboardData = useAdminDashboardData(shouldFetch);

  if (isAuthHookLoading) return <AdminLoadingScreen />;
  if (!isAuthenticated || !isAdmin) return <AdminAccessDeniedScreen isAuthenticated={isAuthenticated} />;

  const handleLogout = async () => {
    await logoutAuthHook();
    await disconnectFromSession();
    router.push('/');
  };

  const currentLabel = MENU_ITEMS.find(item => item.id === activeSection)?.label || 'Dashboard';

  return (
    <SidebarProvider ref={topRef} style={{ "--sidebar-width": "16rem", "--sidebar-width-mobile": "18rem" } as React.CSSProperties}>
      <AdminSidebar menuItems={MENU_ITEMS} activeSection={activeSection} setActiveSection={setActiveSection} onLogout={handleLogout} />
      <SidebarInset className="flex-1 overflow-x-hidden transition-all duration-300 ease-in-out bg-muted/20">
        <AdminHeader label={currentLabel} publicKey={user?.publicKey} />
        <SecurityBanner />
        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
           <AdminContent activeSection={activeSection} setActiveSection={setActiveSection} dashboardData={dashboardData} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
