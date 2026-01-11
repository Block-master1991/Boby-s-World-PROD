
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_WALLET_ADDRESS } from '@/lib/constants';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PawPrint, LogOut, Trash2, Search } from 'lucide-react';
import { useApiFetch } from '@/utils/api';
import { useUserStats, useUserActivityUpdates } from '@/hooks/useAdminStats';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import dynamic from 'next/dynamic';
import { PasskeyManagement } from '@/components/auth/PasskeyManagement';
import { StoreItemsManagement } from '@/components/admin/StoreItemsManagement';
import { AdminUserStatsSkeleton } from '@/components/admin/AdminStatSkeleton';
import { logger } from '@/utils/logger';
import { LoggerDashboard } from '@/components/admin/LoggerDashboard';


// Recharts components are better off being loaded as part of a dynamic chart wrapper
const ChartUIWrapper = dynamic(() => import('@/components/admin/ChartUIWrapper'), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full" />
});
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  BarChart3,
  Users,
  Shield,
  Settings,
  Home,
  Activity,
  Database,
  Package,
  FileText,
  Fingerprint
} from 'lucide-react';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { db } from '@/lib/firebase';
import { collection, getDocs, setDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

function isValidIp(ip: string) {
  // IPv4 only (you can support IPv6 if you want)
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

export default function AdminPage() {
  const { isAuthenticated, isLoading: isAuthHookLoading, user, logout: logoutAuthHook } = useAuth();
  const { disconnectFromSession } = useSessionWallet();
  const router = useRouter();
  const pathname = usePathname();

  // Lists
  const [whitelist, setWhitelist] = useState<{ ip: string, addedAt?: string }[]>([]);
  const [blacklist, setBlacklist] = useState<{ ip: string, addedAt?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Input
  const [newIp, setNewIp] = useState('');
  const [targetList, setTargetList] = useState<'whitelist' | 'blacklist'>('blacklist');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ ip: string, list: 'whitelist' | 'blacklist' } | null>(null);

  // User Statistics
  const [userStats, setUserStats] = useState<{ totalUsers: number, onlineUsers: number, offlineUsers: number } | null>(null);
  const { apiFetch } = useApiFetch(); // Get apiFetch from the hook
  const { data: graphqlUserStats, loading: graphqlLoading, error: graphqlError } = useUserStats();

  // Real-time user activity updates
  const { data: liveActivityData, error: activityError } = useUserActivityUpdates();



  // Search & Pagination
  const [search, setSearch] = useState('');
  const [whitePage, setWhitePage] = useState(1);
  const [blackPage, setBlackPage] = useState(1);
  const PAGE_SIZE = 20;

  // Scroll to top ref
  const topRef = useRef<HTMLDivElement>(null);

  // Navigation state
  const [activeSection, setActiveSection] = useState('overview');

  // Fetch lists from Firestore (with search & pagination)
  async function fetchLists() {
    setLoading(true);
    try {
      const dbQuery = (list: 'whitelist' | 'blacklist') =>
        query(
          collection(db, `ratelimit_${list}`),
          orderBy('addedAt', 'desc'),
        );
      const [whiteSnap, blackSnap] = await Promise.all([
        getDocs(dbQuery('whitelist')),
        getDocs(dbQuery('blacklist')),
      ]);
      let whiteListData = whiteSnap.docs.map(doc => ({
        ip: doc.id,
        addedAt: doc.data().addedAt?.toDate?.().toLocaleString() || '',
      }));
      let blackListData = blackSnap.docs.map(doc => ({
        ip: doc.id,
        addedAt: doc.data().addedAt?.toDate?.().toLocaleString() || '',
      }));

      // Search
      if (search) {
        whiteListData = whiteListData.filter(item => item.ip.includes(search));
        blackListData = blackListData.filter(item => item.ip.includes(search));
      }

      // Pagination
      setWhitelist(whiteListData.slice((whitePage - 1) * PAGE_SIZE, whitePage * PAGE_SIZE));
      setBlacklist(blackListData.slice((blackPage - 1) * PAGE_SIZE, blackPage * PAGE_SIZE));
    } catch {
      setMessage({ type: 'error', text: 'Failed to fetch lists.' });
    }
    setLoading(false);
  }

  useEffect(() => {
    if (user?.publicKey === ADMIN_WALLET_ADDRESS) {
      fetchLists();
      fetchUserStats();
    }
  }, [user, search, whitePage, blackPage]);

  // Fetch user statistics
  const fetchUserStats = React.useCallback(async () => {
    try {
      const response = await apiFetch('/api/admin/users'); // Use apiFetch
      if (!response.ok) {
        throw new Error('Failed to fetch user statistics');
      }
      const data = await response.json();
      setUserStats(data);
    } catch (err) {
      logger.error('Error fetching user stats:', err as Error);
      setMessage({ type: 'error', text: 'Failed to fetch user statistics.' });
    }
  }, [apiFetch]);





  // Add IP
  async function handleAddIp() {
    if (!isValidIp(newIp)) {
      setMessage({ type: 'error', text: 'Invalid IP address.' });
      return;
    }
    setLoading(true);
    try {
      await setDoc(doc(db, `ratelimit_${targetList}`, newIp), { addedAt: new Date() });
      setMessage({ type: 'success', text: `IP (${newIp}) was added to the ${targetList === 'whitelist' ? 'whitelist' : 'blacklist'} successfully.` });
      setNewIp('');
      fetchLists();
      // Scroll to top on success
      setTimeout(() => {
        topRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch {
      setMessage({ type: 'error', text: 'Failed to add IP.' });
    }
    setLoading(false);
  }

  // Delete IP
  async function handleDeleteIp(ip: string, list: 'whitelist' | 'blacklist') {
    setLoading(true);
    try {
      await deleteDoc(doc(db, `ratelimit_${list}`, ip));
      setMessage({ type: 'success', text: `IP (${ip}) was removed from the ${list === 'whitelist' ? 'whitelist' : 'blacklist'} successfully.` });
      fetchLists();
      setTimeout(() => {
        topRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch {
      setMessage({ type: 'error', text: 'Failed to remove IP.' });
    }
    setLoading(false);
    setConfirmDelete(null);
  }

  // Access protection - handle token expiration like regular users
  useEffect(() => {
    if (isAuthHookLoading) return;

    // First check if user is authenticated
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    // Then check if user is admin
    if (user?.publicKey !== ADMIN_WALLET_ADDRESS) {
      router.push('/');
      return;
    }
  }, [isAuthenticated, isAuthHookLoading, user, pathname, router]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  if (isAuthHookLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8">
        <PawPrint className="h-16 w-16 animate-pulse text-primary mb-4" />
        <p className="text-xl">Verifying admin access...</p>
      </div>
    );
  }

  if (!isAuthenticated || user?.publicKey !== ADMIN_WALLET_ADDRESS) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8">
        <PawPrint className="h-16 w-16 animate-pulse text-primary mb-4" />
        <p className="text-xl">{!isAuthenticated ? 'Session expired. Redirecting...' : 'Access denied. Redirecting...'}</p>
      </div>
    );
  }

  // Chart data for analytics
  const userChartData = [
    { name: 'Online', value: userStats?.onlineUsers || 0, color: '#22c55e' },
    { name: 'Offline', value: userStats?.offlineUsers || 0, color: '#64748b' },
  ];

  const activityData = [
    { month: 'Jan', users: 120 },
    { month: 'Feb', users: 150 },
    { month: 'Mar', users: 180 },
    { month: 'Apr', users: 200 },
    { month: 'May', users: 220 },
    { month: 'Jun', users: 250 },
  ];

  const menuItems = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'items', label: 'Items', icon: Package },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'logs', label: 'Audit Logs', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <SidebarProvider
      ref={topRef}
      style={{
        "--sidebar-width": "16rem",
        "--sidebar-width-mobile": "18rem",
      } as React.CSSProperties}
      className="flex min-h-screen w-full bg-background text-foreground group/sidebar-wrapper"
    >
      <Sidebar collapsible="icon" variant="inset" className="border-r border-border/50">
        <SidebarHeader className="border-b border-border/50 bg-sidebar">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
              <PawPrint className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col overflow-hidden transition-all group-data-[collapsible=icon]:hidden">
              <span className="font-bold text-lg truncate">Boby Admin</span>
              <p className="text-[10px] text-muted-foreground truncate">Control Panel</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      onClick={() => {
                        setActiveSection(item.id);
                      }}
                      isActive={activeSection === item.id}
                      tooltip={item.label}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={async () => {
                  await logoutAuthHook();
                  await disconnectFromSession();
                  router.push('/');
                }}
                variant="outline"
                tooltip="Logout"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex-1 overflow-x-hidden transition-all duration-300 ease-in-out bg-muted/20">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border/50 px-6 bg-background/60 backdrop-blur-lg shadow-sm">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="-ml-1 h-9 w-9 hover:bg-muted/50 transition-colors rounded-lg" />
            <div className="h-6 w-[1px] bg-border/60" />
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm md:hidden">
                <PawPrint className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {menuItems.find(item => item.id === activeSection)?.label || 'Dashboard'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-full bg-green-500/5 border border-green-500/20 text-[11px] font-medium text-green-600 uppercase tracking-wider">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
              Live System
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-2.5 py-1 text-xs font-mono bg-muted/50 border-border/50">
                {user?.publicKey?.slice(0, 6)}...{user?.publicKey?.slice(-4)}
              </Badge>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {activeSection === 'overview' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Welcome Banner */}
                <Card className="border-0 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-500/10">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-2xl">Welcome back, Admin</CardTitle>
                        <CardDescription className="mt-1">Here's what's happening with Boby World today.</CardDescription>
                      </div>
                      <div className="hidden md:block">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg">
                          <PawPrint className="h-8 w-8 text-white" />
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="relative overflow-hidden border-border/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/20 to-transparent rounded-bl-full"></div>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-500" />
                        User Statistics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {graphqlLoading ? (
                        <AdminUserStatsSkeleton />
                      ) : graphqlError ? (
                        <p className="text-sm text-destructive">Error loading stats</p>
                      ) : (
                        <>
                          <p className="text-3xl font-bold">{graphqlUserStats?.userStats?.totalUsers ?? 0}</p>
                          <p className="text-sm text-muted-foreground">Total Players</p>
                          <div className="mt-3 flex gap-4">
                            <div>
                              <p className="text-lg font-semibold text-green-500">{graphqlUserStats?.userStats?.onlineUsers ?? 0}</p>
                              <p className="text-xs text-muted-foreground">Online</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-slate-400">{graphqlUserStats?.userStats?.offlineUsers ?? 0}</p>
                              <p className="text-xs text-muted-foreground">Offline</p>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card className="relative overflow-hidden border-green-500/20 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-green-500/20 to-transparent rounded-bl-full"></div>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Activity className="h-4 w-4 text-green-500" />
                        Live Activity
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {activityError ? (
                        <p className="text-sm text-destructive">Live updates unavailable</p>
                      ) : (
                        <>
                          <p className="text-3xl font-bold text-green-500">{liveActivityData?.onlineUsers ?? 0}</p>
                          <p className="text-sm text-muted-foreground">Users Online Now</p>
                          <div className="mt-3">
                            <p className="text-lg font-semibold">{liveActivityData?.activeGames ?? 0}</p>
                            <p className="text-xs text-muted-foreground">Active Game Sessions</p>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card className="relative overflow-hidden border-border/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-purple-500/20 to-transparent rounded-bl-full"></div>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Settings className="h-4 w-4 text-purple-500" />
                        Quick Actions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setActiveSection('items')}>
                          <Package className="h-4 w-4 mr-2" />
                          Manage Store Items
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setActiveSection('security')}>
                          <Shield className="h-4 w-4 mr-2" />
                          Security Settings
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setActiveSection('logs')}>
                          <FileText className="h-4 w-4 mr-2" />
                          View Logs
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeSection === 'security' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-orange-500">
                        <Shield className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle>Security Management</CardTitle>
                        <CardDescription>Manage IP Whitelist & Blacklist. Only valid IPv4 addresses are accepted.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Notification messages */}
                    {message && (
                      <div className={`p-3 rounded-lg border flex items-center gap-2 ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-red-500/10 border-red-500/20 text-red-600'}`}>
                        {message.type === 'success' ? '✓' : '⚠'} {message.text}
                      </div>
                    )}

                    {/* Search and Add IP */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Search IPs</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Search for IP..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setWhitePage(1); setBlackPage(1); }}
                            className="w-full pl-9 pr-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Add New IP</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="192.168.1.1"
                            value={newIp}
                            onChange={e => setNewIp(e.target.value)}
                            className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                            disabled={loading}
                          />
                          <select 
                            value={targetList} 
                            onChange={e => setTargetList(e.target.value as 'whitelist' | 'blacklist')} 
                            className="px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            disabled={loading}
                          >
                            <option value="whitelist">Whitelist</option>
                            <option value="blacklist">Blacklist</option>
                          </select>
                          <Button onClick={handleAddIp} disabled={loading || !newIp}>
                            Add IP
                          </Button>
                        </div>
                      </div>
                    </div>

                  {/* Lists */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Whitelist */}
                    <div>
                      <h2 className="font-bold mb-2">Whitelist</h2>
                      {loading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                        </div>
                      ) : (
                        <>
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="text-left">IP</th>
                                <th className="text-left">Added At</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {whitelist.map(({ ip, addedAt }) => (
                                <tr key={ip}>
                                  <td>{ip}</td>
                                  <td>{addedAt || '-'}</td>
                                  <td>
                                    <Button variant="ghost" size="icon" onClick={() => setConfirmDelete({ ip, list: 'whitelist' })} disabled={loading}>
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {/* Pagination */}
                          <div className="flex gap-2 mt-2">
                            <Button variant="outline" size="sm" disabled={whitePage === 1} onClick={() => setWhitePage(p => p - 1)}>Previous</Button>
                            <span>Page {whitePage}</span>
                            <Button variant="outline" size="sm" disabled={whitelist.length < PAGE_SIZE} onClick={() => setWhitePage(p => p + 1)}>Next</Button>
                          </div>
                        </>
                      )}
                    </div>
                    {/* Blacklist */}
                    <div>
                      <h2 className="font-bold mb-2">Blacklist</h2>
                      {loading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                        </div>
                      ) : (
                        <>
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="text-left">IP</th>
                                <th className="text-left">Added At</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {blacklist.map(({ ip, addedAt }) => (
                                <tr key={ip}>
                                  <td>{ip}</td>
                                  <td>{addedAt || '-'}</td>
                                  <td>
                                    <Button variant="ghost" size="icon" onClick={() => setConfirmDelete({ ip, list: 'blacklist' })} disabled={loading}>
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {/* Pagination */}
                          <div className="flex gap-2 mt-2">
                            <Button variant="outline" size="sm" disabled={blackPage === 1} onClick={() => setBlackPage(p => p - 1)}>Previous</Button>
                            <span>Page {blackPage}</span>
                            <Button variant="outline" size="sm" disabled={blacklist.length < PAGE_SIZE} onClick={() => setBlackPage(p => p + 1)}>Next</Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Passkey Management */}
                  <div className="mt-12 pt-8 border-t">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <Fingerprint className="w-6 h-6 text-primary" />
                      Administrative Biometrics
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                      Manage your passkeys for secure administrative access. High-security actions require biometric verification.
                    </p>
                    <div className="bg-card/50 rounded-lg p-6 border">
                      <PasskeyManagement />
                    </div>
                  </div>
                </CardContent>
              </Card>
              </div>
            )}

            {activeSection === 'logs' && (
              <LoggerDashboard />
            )}

            {activeSection === 'analytics' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Analytics Dashboard</CardTitle>
                    <CardDescription>View detailed analytics and performance metrics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* User Status Chart */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">User Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ChartUIWrapper type="pie" data={userChartData} config={{}} />
                        </CardContent>
                      </Card>

                      {/* Activity Trend */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">User Activity Trend</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ChartUIWrapper
                            type="line"
                            data={activityData.map(d => ({ name: d.month, value: d.users }))}
                            config={{}}
                          />
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'users' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <Card className="border-dashed border-2 border-muted-foreground/20">
                  <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Users className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Manage user accounts, permissions, and player data</CardDescription>
                  </CardHeader>
                  <CardContent className="text-center">
                    <p className="text-muted-foreground mb-4">User management features are under development.</p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <Badge variant="outline" className="text-xs">Search Users</Badge>
                      <Badge variant="outline" className="text-xs">Ban Management</Badge>
                      <Badge variant="outline" className="text-xs">Activity History</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'items' && (
              <StoreItemsManagement />
            )}

            {activeSection === 'settings' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <Card className="border-dashed border-2 border-muted-foreground/20">
                  <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Settings className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <CardTitle>System Settings</CardTitle>
                    <CardDescription>Configure system parameters and preferences</CardDescription>
                  </CardHeader>
                  <CardContent className="text-center">
                    <p className="text-muted-foreground mb-4">System configuration options are under development.</p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <Badge variant="outline" className="text-xs">Game Parameters</Badge>
                      <Badge variant="outline" className="text-xs">Economy Settings</Badge>
                      <Badge variant="outline" className="text-xs">Server Config</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </main>

          {/* Delete confirmation modal */}
          {confirmDelete && (
            <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200">
              <Card className="w-full max-w-md mx-4 shadow-2xl border-destructive/20">
                <CardHeader>
                  <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
                    <Trash2 className="h-6 w-6 text-destructive" />
                  </div>
                  <CardTitle className="text-center">Confirm Deletion</CardTitle>
                  <CardDescription className="text-center">
                    Are you sure you want to remove IP <span className="font-mono font-bold text-foreground">{confirmDelete.ip}</span> from the <span className="font-semibold text-foreground">{confirmDelete.list}</span>?
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3 justify-end">
                    <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={loading}>Cancel</Button>
                    <Button variant="destructive" onClick={() => handleDeleteIp(confirmDelete.ip, confirmDelete.list)} disabled={loading}>
                      {loading ? 'Deleting...' : 'Yes, Delete'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </SidebarInset>
    </SidebarProvider >
  );
}
