'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { IpEntry } from '@/hooks/useAdminIpManagement'; // Fixed: Type import
import { Trash2 } from 'lucide-react';

interface IpListTableProps {
  title: string;
  list: IpEntry[];
  loading: boolean;
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (p: number) => void;
  onDelete: (ip: string) => void;
}

export function IpListTable({
  title,
  list,
  loading,
  page,
  pageSize,
  totalItems,
  onPageChange,
  onDelete,
}: IpListTableProps) {
  return (
    <div>
      <h2 className="font-bold mb-2">{title}</h2>
      {loading ? (
        <IpListSkeleton />
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
              {list.map((item) => (
                <IpListRow key={item.ip} item={item} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
          <IpListPagination
            page={page}
            pageSize={pageSize}
            totalItems={totalItems}
            onPageChange={onPageChange}
          />
        </>
      )}
    </div>
  );
}

function IpListSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

function IpListRow({ item, onDelete }: { item: IpEntry; onDelete: (ip: string) => void }) {
  return (
    <tr>
      <td>{item.ip}</td>
      <td>{item.addedAt || '-'}</td>
      <td>
        <Button variant="ghost" size="icon" onClick={() => onDelete(item.ip)}>
          <Trash2 className="w-4 h-4 text-red-500" />
        </Button>
      </td>
    </tr>
  );
}

function IpListPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex gap-2 mt-2">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <span>Page {page}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={totalItems <= page * pageSize}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
