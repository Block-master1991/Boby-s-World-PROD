"use client";

import { IpListTable } from "@/components/admin/sections/IpListTable";
import type { IpEntry } from "@/hooks/admin/useAdminIpManagement";

interface IpManagementGridProps {
  whitelist: IpEntry[];
  blacklist: IpEntry[];
  loading: boolean;
  whitePage: number;
  blackPage: number;
  PAGE_SIZE: number;
  getPaginatedList: (type: "whitelist" | "blacklist") => IpEntry[];
  setWhitePage: (page: number) => void;
  setBlackPage: (page: number) => void;
  onConfirmDelete: (ip: string, list: "whitelist" | "blacklist") => void;
}

export function IpManagementGrid({
  whitelist,
  blacklist,
  loading,
  whitePage,
  blackPage,
  PAGE_SIZE,
  getPaginatedList,
  setWhitePage,
  setBlackPage,
  onConfirmDelete,
}: IpManagementGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <IpListTable
        title="Whitelist"
        list={getPaginatedList("whitelist")}
        loading={loading}
        page={whitePage}
        pageSize={PAGE_SIZE}
        totalItems={whitelist.length}
        onPageChange={setWhitePage}
        onDelete={ip => onConfirmDelete(ip, "whitelist")}
      />
      <IpListTable
        title="Blacklist"
        list={getPaginatedList("blacklist")}
        loading={loading}
        page={blackPage}
        pageSize={PAGE_SIZE}
        totalItems={blacklist.length}
        onPageChange={setBlackPage}
        onDelete={ip => onConfirmDelete(ip, "blacklist")}
      />
    </div>
  );
}
