"use client";

import { useSessionWallet } from "@/hooks/auth/useSessionWallet";
import { useToast } from "@/hooks/ui/use-toast";
import { apiFetch } from "@/utils/api";
import { createSignedAdminHeaders } from "@/utils/frontend-auth";
import type { useStoreManagementState } from "./useStoreManagementState";

export const useStoreManagementMaintenance = (
  state: ReturnType<typeof useStoreManagementState>,
  loadItems: () => Promise<void>
) => {
  const { toast } = useToast();
  const { signMessage, adapterPublicKey: walletPublicKey } = useSessionWallet();
  const { setMigrating, setMigratingImages, setUploading, setFormData } = state;

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, {
        filename: file.name,
      });
      const headers = { ...signedHeaders } as Record<string, string>;
      delete headers["Content-Type"];

      const res = await apiFetch("/api/admin/upload-image", {
        method: "POST",
        headers,
        body: uploadFormData,
      });
      const data = await res.json();
      if (data.success) {
        setFormData(prev => ({ ...prev, image: data.url }));
        toast({ title: "Success", description: "Image uploaded" });
      }
    } finally {
      setUploading(false);
    }
  };

  const runMaintenanceTask = async (task: "migrate-inventory" | "migrate-images") => {
    const setter = task === "migrate-inventory" ? setMigrating : setMigratingImages;
    const endpoint = `/api/admin/${task}`;
    setter(true);
    try {
      const headers = await createSignedAdminHeaders(signMessage, walletPublicKey, {});
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      toast({
        title: data.success ? "Success" : "Failed",
        description: data.message || data.error,
      });
      if (data.success && task === "migrate-images") await loadItems();
    } finally {
      setter(false);
    }
  };

  return {
    handleImageUpload,
    runMigration: () => runMaintenanceTask("migrate-inventory"),
    runImageMigration: () => runMaintenanceTask("migrate-images"),
  };
};
