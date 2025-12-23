
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_WALLET_ADDRESS } from '@/lib/constants';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PawPrint, LogOut, Trash2, Search } from 'lucide-react';
import { useApiFetch } from '@/utils/api';
import { useUserStats } from '@/hooks/useGraphQL';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
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
  TrendingUp,
  Activity,
  Database
} from 'lucide-react';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { db } from '@/lib/firebase';
import { collection, getDocs, setDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

function isValidIp(ip: string) {
  // IPv4 only (you can support IPv6 if you want)
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

export default function AdminPage() {
  const { isLoading: isAuthHookLoading, user, logout: logoutAuthHook } = useAuth();
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
    // eslint-disable-next-line
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
      console.error('Error fetching user stats:', err);
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

  // Access protection
  useEffect(() => {
    if (isAuthHookLoading) return;
    if (user?.publicKey !== ADMIN_WALLET_ADDRESS && pathname !== '/') {
      router.push('/');
    }
  }, [isAuthHookLoading, user, pathname, router]);

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

  if (user?.publicKey !== ADMIN_WALLET_ADDRESS) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8">
        <PawPrint className="h-16 w-16 animate-pulse text-primary mb-4" />
        <p className="text-xl">Redirecting...</p>
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
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <SidebarProvider>
      <div ref={topRef} className="flex min-h-screen w-full bg-background text-foreground">
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2 px-4 py-2">
              <Database className="h-6 w-6" />
              <span className="font-semibold">Admin Panel</span>
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
                        onClick={() => setActiveSection(item.id)}
                        isActive={activeSection === item.id}
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
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex-1">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              <h1 className="text-xl font-semibold">
                {menuItems.find(item => item.id === activeSection)?.label || 'Admin Dashboard'}
              </h1>
            </div>
            <div className="ml-auto">
              <Badge variant="outline" className="text-xs">
                Admin: {user?.publicKey?.slice(0, 8)}...
              </Badge>
            </div>
          </header>

          <main className="flex-1 p-6">
            {activeSection === 'overview' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Overview</CardTitle>
                    <CardDescription>Admin panel content for Boby World.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p>Manage game settings, view player statistics, and oversee the Boby ecosystem.</p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="bg-card/50">
                        <CardHeader>
                          <CardTitle className="text-lg">User Statistics</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {graphqlLoading ? (
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-4 w-1/2" />
                              <Skeleton className="h-4 w-2/3" />
                            </div>
                          ) : graphqlError ? (
                            <p className="text-sm text-destructive">Error loading GraphQL stats: {graphqlError}</p>
                          ) : (
                            <>
                              <p className="text-sm text-muted-foreground">Total Players: {graphqlUserStats?.userStats?.totalUsers ?? 'N/A'}</p>
                              <p className="text-sm text-muted-foreground">Online Now: {graphqlUserStats?.userStats?.onlineUsers ?? 'N/A'}</p>
                              <p className="text-sm text-muted-foreground">Offline: {graphqlUserStats?.userStats?.offlineUsers ?? 'N/A'}</p>
                              <Badge variant="secondary" className="mt-2 text-xs">Via GraphQL</Badge>
                            </>
                          )}
                        </CardContent>
                      </Card>
                      <Card className="bg-card/50">
                        <CardHeader>
                          <CardTitle className="text-lg">Game Settings</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">Modify game parameters here.</p>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'security' && (
              <Card>
                <CardHeader>
                  <CardTitle>Security Management</CardTitle>
                  <CardDescription>
                    Manage IP Whitelist & Blacklist. Only valid IPv4 addresses are accepted.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Notification messages */}
                  {message && (
                    <div className={`mb-4 p-2 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {message.text}
                    </div>
                  )}

                  {/* Search */}
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      placeholder="Search for IP..."
                      value={search}
                      onChange={e => { setSearch(e.target.value); setWhitePage(1); setBlackPage(1); }}
                      className="border rounded px-2 py-1"
                    />
                    <Search className="w-5 h-5 text-muted-foreground" />
                  </div>

                  {/* Add IP */}
                  <div className="flex gap-2 mb-6">
                    <input
                      type="text"
                      placeholder="Enter IP address"
                      value={newIp}
                      onChange={e => setNewIp(e.target.value)}
                      className="border rounded px-2 py-1"
                      disabled={loading}
                    />
                    <select value={targetList} onChange={e => setTargetList(e.target.value as 'whitelist' | 'blacklist')} className="border rounded px-2 py-1" disabled={loading}>
                      <option value="whitelist">Whitelist</option>
                      <option value="blacklist">Blacklist</option>
                    </select>
                    <Button onClick={handleAddIp} disabled={loading || !newIp}>Add IP</Button>
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
                </CardContent>
              </Card>
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
                          <ChartContainer config={{}} className="h-[200px]">
                            <PieChart>
                              <Pie
                                data={userChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {userChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <ChartTooltip content={<ChartTooltipContent />} />
                            </PieChart>
                          </ChartContainer>
                        </CardContent>
                      </Card>

                      {/* Activity Trend */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">User Activity Trend</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ChartContainer config={{}} className="h-[200px]">
                            <LineChart data={activityData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="month" />
                              <YAxis />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              <Line type="monotone" dataKey="users" stroke="#8884d8" strokeWidth={2} />
                            </LineChart>
                          </ChartContainer>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'users' && (
              <Card>
                <CardHeader>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>Manage user accounts and permissions</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">User management features coming soon...</p>
                </CardContent>
              </Card>
            )}

            {activeSection === 'settings' && (
              <Card>
                <CardHeader>
                  <CardTitle>System Settings</CardTitle>
                  <CardDescription>Configure system parameters and preferences</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">System settings coming soon...</p>
                </CardContent>
              </Card>
            )}
          </main>

          {/* Delete confirmation modal */}
          {confirmDelete && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
              <div className="bg-white p-6 rounded shadow-lg">
                <p>Are you sure you want to remove IP <b>{confirmDelete.ip}</b> from the <b>{confirmDelete.list === 'whitelist' ? 'whitelist' : 'blacklist'}</b>?&apos;</p>
                <div className="flex gap-4 mt-4">
                  <Button variant="destructive" onClick={() => handleDeleteIp(confirmDelete.ip, confirmDelete.list)} disabled={loading}>Yes, Delete</Button>
                  <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={loading}>Cancel</Button>
                </div>
              </div>
            </div>
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
