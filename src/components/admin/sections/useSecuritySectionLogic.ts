"use client";

import { useAdminIpManagement } from "@/hooks/useAdminIpManagement";
import { useEffect, useState } from "react";

export function useSecuritySectionLogic() {
  const adminIp = useAdminIpManagement();

  const [search, setSearch] = useState("");
  const [newIp, setNewIp] = useState("");
  const [targetList, setTargetList] = useState<"whitelist" | "blacklist">("blacklist");
  const [confirmDelete, setConfirmDelete] = useState<{
    ip: string;
    list: "whitelist" | "blacklist";
  } | null>(null);

  useEffect(() => {
    adminIp.fetchLists(search);
  }, [search, adminIp.fetchLists]);

  useEffect(() => {
    if (adminIp.message) {
      const t = setTimeout(() => adminIp.setMessage(null), 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [adminIp.message, adminIp.setMessage]);

  const handleAddIp = async () => {
    await adminIp.addIp(newIp, targetList, () => setNewIp(""));
  };

  const handleConfirmDelete = async () => {
    if (confirmDelete) {
      await adminIp.deleteIp(confirmDelete.ip, confirmDelete.list);
      setConfirmDelete(null);
    }
  };

  const resetPagination = () => {
    adminIp.setWhitePage(1);
    adminIp.setBlackPage(1);
  };

  return {
    ...adminIp,
    search,
    setSearch,
    newIp,
    setNewIp,
    targetList,
    setTargetList,
    confirmDelete,
    setConfirmDelete,
    handleAddIp,
    handleConfirmDelete,
    resetPagination,
  };
}
