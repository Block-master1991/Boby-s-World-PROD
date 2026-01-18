'use client';

import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';

export function SecurityHeader() {
  return (
    <CardHeader>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-orange-500">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <CardTitle>Security Management</CardTitle>
          <CardDescription>
            Manage IP Whitelist & Blacklist. Only valid IPv4 addresses are accepted.
          </CardDescription>
        </div>
      </div>
    </CardHeader>
  );
}
