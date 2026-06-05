"use client";

import { useState } from "react";

export interface Passkey {
  id: string;
  credentialId: string;
  description?: string;
  deviceBrand?: string;
  aaguid?: string;
  createdAt: string;
  lastUsedAt: string;
  transports?: string[];
}

export const usePasskeyState = () => {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return {
    passkeys,
    setPasskeys,
    loading,
    setLoading,
    registering,
    setRegistering,
    deleting,
    setDeleting,
    description,
    setDescription,
    isDialogOpen,
    setIsDialogOpen,
  };
};
