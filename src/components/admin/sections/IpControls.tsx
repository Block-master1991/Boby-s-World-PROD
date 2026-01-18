'use client';

import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface IpControlsProps {
  search: string;
  setSearch: (s: string) => void;
  newIp: string;
  setNewIp: (s: string) => void;
  targetList: 'whitelist' | 'blacklist';
  setTargetList: (l: 'whitelist' | 'blacklist') => void;
  loading: boolean;
  onAddIp: () => void;
  resetPagination: () => void;
}

export function IpControls({
  search,
  setSearch,
  newIp,
  setNewIp,
  targetList,
  setTargetList,
  loading,
  onAddIp,
  resetPagination,
}: IpControlsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <IpSearchControl search={search} setSearch={setSearch} resetPagination={resetPagination} />
      <IpAddControl
        newIp={newIp}
        setNewIp={setNewIp}
        targetList={targetList}
        setTargetList={setTargetList}
        loading={loading}
        onAddIp={onAddIp}
      />
    </div>
  );
}

function IpSearchControl({
  search,
  setSearch,
  resetPagination,
}: {
  search: string;
  setSearch: (s: string) => void;
  resetPagination: () => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">Search IPs</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search for IP..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPagination();
          }}
          className="w-full pl-9 pr-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    </div>
  );
}

function IpAddControl({
  newIp,
  setNewIp,
  targetList,
  setTargetList,
  loading,
  onAddIp,
}: {
  newIp: string;
  setNewIp: (s: string) => void;
  targetList: 'whitelist' | 'blacklist';
  setTargetList: (l: 'whitelist' | 'blacklist') => void;
  loading: boolean;
  onAddIp: () => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">Add New IP</label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="192.168.1.1"
          value={newIp}
          onChange={(e) => setNewIp(e.target.value)}
          className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={loading}
        />
        <select
          value={targetList}
          onChange={(e) => setTargetList(e.target.value as 'whitelist' | 'blacklist')}
          className="px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={loading}
        >
          <option value="whitelist">Whitelist</option>
          <option value="blacklist">Blacklist</option>
        </select>
        <Button onClick={onAddIp} disabled={loading || !newIp}>
          Add IP
        </Button>
      </div>
    </div>
  );
}
