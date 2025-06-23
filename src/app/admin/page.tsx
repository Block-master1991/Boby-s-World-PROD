
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_WALLET_ADDRESS } from '@/lib/constants';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut, Trash2, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [whitelist, setWhitelist] = useState<{ip: string, addedAt?: string}[]>([]);
  const [blacklist, setBlacklist] = useState<{ip: string, addedAt?: string}[]>([]);
  const [loading, setLoading] = useState(true);

  // Input
  const [newIp, setNewIp] = useState('');
  const [targetList, setTargetList] = useState<'whitelist'|'blacklist'>('blacklist');
  const [message, setMessage] = useState<{type: 'success'|'error', text: string}|null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ip: string, list: 'whitelist'|'blacklist'}|null>(null);

  // Search & Pagination
  const [search, setSearch] = useState('');
  const [whitePage, setWhitePage] = useState(1);
  const [blackPage, setBlackPage] = useState(1);
  const PAGE_SIZE = 20;

  // Scroll to top ref
  const topRef = useRef<HTMLDivElement>(null);

  // Fetch lists from Firestore (with search & pagination)
  async function fetchLists() {
    setLoading(true);
    try {
      const dbQuery = (list: 'whitelist'|'blacklist') =>
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
      setWhitelist(whiteListData.slice((whitePage-1)*PAGE_SIZE, whitePage*PAGE_SIZE));
      setBlacklist(blackListData.slice((blackPage-1)*PAGE_SIZE, blackPage*PAGE_SIZE));
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to fetch lists.' });
    }
    setLoading(false);
  }

  useEffect(() => {
    if (user?.publicKey === ADMIN_WALLET_ADDRESS) fetchLists();
    // eslint-disable-next-line
  }, [user, search, whitePage, blackPage]);

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
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to add IP.' });
    }
    setLoading(false);
  }

  // Delete IP
  async function handleDeleteIp(ip: string, list: 'whitelist'|'blacklist') {
    setLoading(true);
    try {
      await deleteDoc(doc(db, `ratelimit_${list}`, ip));
      setMessage({ type: 'success', text: `IP (${ip}) was removed from the ${list === 'whitelist' ? 'whitelist' : 'blacklist'} successfully.` });
      fetchLists();
      setTimeout(() => {
        topRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
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
  }, [isAuthHookLoading, user, pathname, ADMIN_WALLET_ADDRESS]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  if (isAuthHookLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl">Verifying admin access...</p>
      </div>
    );
  }

  if (user?.publicKey !== ADMIN_WALLET_ADDRESS) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl">Redirecting...</p>
      </div>
    );
  }

  return (
    <div ref={topRef} className="flex flex-col items-center min-h-screen bg-background text-foreground p-4 md:p-8">
      <header className="w-full max-w-4xl py-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl md:text-4xl font-bold text-primary">Admin Dashboard</h1>
          <Button
            onClick={async () => {
              await logoutAuthHook();
              await disconnectFromSession();
              router.push('/');
            }}
            variant="outline"
            size="sm"
          >
            <LogOut className="mr-2 h-4 w-4" /> Logout & Disconnect
          </Button>
        </div>
        <p className="text-muted-foreground mt-1">Welcome, Admin! Wallet: {user?.publicKey || 'N/A'}</p>
      </header>

      <main className="w-full max-w-4xl mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>Admin panel content for Boby's World.</CardDescription>
          <CardTitle>Manage IP Whitelist & Blacklist</CardTitle>
            <CardDescription>
              Add or remove IPs from the whitelist or blacklist. Only valid IPv4 addresses are accepted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Manage game settings, view player statistics, and oversee the Boby ecosystem.</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-card/50">
                    <CardHeader>
                        <CardTitle className="text-lg">User Statistics</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Total Players: Fetching...</p>
                        <p className="text-sm text-muted-foreground">Online Now: Fetching...</p>
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
              <select value={targetList} onChange={e => setTargetList(e.target.value as 'whitelist'|'blacklist')} className="border rounded px-2 py-1" disabled={loading}>
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
                {loading ? <Loader2 className="animate-spin" /> : (
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
                      {whitelist.map(({ip, addedAt}) => (
                        <tr key={ip}>
                          <td>{ip}</td>
                          <td>{addedAt || '-'}</td>
                          <td>
                            <Button variant="ghost" size="icon" onClick={() => setConfirmDelete({ip, list: 'whitelist'})} disabled={loading}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Pagination */}
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" size="sm" disabled={whitePage === 1} onClick={() => setWhitePage(p => p-1)}>Previous</Button>
                    <span>Page {whitePage}</span>
                    <Button variant="outline" size="sm" disabled={whitelist.length < PAGE_SIZE} onClick={() => setWhitePage(p => p+1)}>Next</Button>
                  </div>
                  </>
                )}
              </div>
              {/* Blacklist */}
              <div>
                <h2 className="font-bold mb-2">Blacklist</h2>
                {loading ? <Loader2 className="animate-spin" /> : (
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
                      {blacklist.map(({ip, addedAt}) => (
                        <tr key={ip}>
                          <td>{ip}</td>
                          <td>{addedAt || '-'}</td>
                          <td>
                            <Button variant="ghost" size="icon" onClick={() => setConfirmDelete({ip, list: 'blacklist'})} disabled={loading}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Pagination */}
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" size="sm" disabled={blackPage === 1} onClick={() => setBlackPage(p => p-1)}>Previous</Button>
                    <span>Page {blackPage}</span>
                    <Button variant="outline" size="sm" disabled={blacklist.length < PAGE_SIZE} onClick={() => setBlackPage(p => p+1)}>Next</Button>
                  </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded shadow-lg">
            <p>Are you sure you want to remove IP <b>{confirmDelete.ip}</b> from the <b>{confirmDelete.list === 'whitelist' ? 'whitelist' : 'blacklist'}</b>?</p>
            <div className="flex gap-4 mt-4">
              <Button variant="destructive" onClick={() => handleDeleteIp(confirmDelete.ip, confirmDelete.list)} disabled={loading}>Yes, Delete</Button>
              <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={loading}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
