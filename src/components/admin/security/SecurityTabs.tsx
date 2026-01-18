'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BlockedIp, SuspiciousActivity } from '@/types/security';

interface BlockedIpTableProps {
  blockedIps: BlockedIp[];
  onUnblock: (ip: string) => void;
  isProcessing: boolean;
}

function BlockedIpTable({ blockedIps, onUnblock, isProcessing }: BlockedIpTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Permanent Blacklist</CardTitle>
        <CardDescription>IP addresses currently banned from accessing the API.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IP Address</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Blocked At</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blockedIps.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center">No blocked IPs found.</TableCell></TableRow>
            ) : (
              blockedIps.map((block) => (
                <TableRow key={block.ip}>
                  <TableCell className="font-mono">{block.ip}</TableCell>
                  <TableCell>{block.reason}</TableCell>
                  <TableCell>{new Date(block.blockedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => onUnblock(block.ip)} disabled={isProcessing}>
                      Unblock
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SuspiciousActivityTable({ activities }: { activities: SuspiciousActivity[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Suspicious Activity</CardTitle>
        <CardDescription>Real-time stream of identified threats (Last 20 events).</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center">No recent suspicious activity.</TableCell></TableRow>
            ) : (
              activities.map((activity, idx) => (
                <TableRow key={idx}>
                  <TableCell className="capitalize">{activity.type?.replace('_', ' ')}</TableCell>
                  <TableCell>
                    <Badge variant={activity.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {activity.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{activity.endpoint}</TableCell>
                  <TableCell className="font-mono text-xs">{activity.ip}</TableCell>
                  <TableCell>{new Date(activity.timestamp).toLocaleTimeString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface SecurityTabsProps {
  blockedIps: BlockedIp[];
  suspiciousActivity: SuspiciousActivity[];
  onUnblock: (ip: string) => void;
  isProcessing: boolean;
}

export function SecurityTabs({ blockedIps, suspiciousActivity, onUnblock, isProcessing }: SecurityTabsProps) {
  return (
    <Tabs defaultValue="blocked" className="space-y-4">
      <TabsList>
        <TabsTrigger value="blocked">Blocked IPs</TabsTrigger>
        <TabsTrigger value="activity">Suspicious Activity</TabsTrigger>
      </TabsList>

      <TabsContent value="blocked" className="space-y-4">
        <BlockedIpTable blockedIps={blockedIps} onUnblock={onUnblock} isProcessing={isProcessing} />
      </TabsContent>

      <TabsContent value="activity" className="space-y-4">
        <SuspiciousActivityTable activities={suspiciousActivity} />
      </TabsContent>
    </Tabs>
  );
}
