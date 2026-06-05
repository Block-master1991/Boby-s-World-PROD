"use client";

import { useToast } from "@/hooks/use-toast";
import { useSessionWallet } from "@/hooks/useSessionWallet";
import { createSignedAdminHeaders } from "@/utils/frontend-auth";
import { logger } from "@/utils/logger";

export const useStoreMigration = () => {
  const { toast } = useToast();
  const { signMessage, adapterPublicKey: walletPublicKey } = useSessionWallet();

  const handleMigration = async (): Promise<boolean> => {
    try {
      const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, {});

      const response = await fetch("/api/admin/migrate-inventory", {
        method: "POST",
        headers: signedHeaders,
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Migration Completed",
          description: "Inventory migration completed successfully",
        });
        logger.log("Migration output:", data.output);
        return true;
      }

      toast({
        title: "Migration Failed",
        description: data.error || "Migration failed",
        variant: "destructive",
      });
      logger.error("Migration error:", data.errorOutput);
      return false;
    } catch (error) {
      logger.error("Error running migration:", error as Error);
      toast({
        title: "Migration Error",
        description: "Failed to run migration",
        variant: "destructive",
      });
      return false;
    }
  };

  return { handleMigration };
};
