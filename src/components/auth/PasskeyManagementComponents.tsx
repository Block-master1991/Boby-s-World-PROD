"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Passkey } from "@/hooks/usePasskeyManagement";
import { Smartphone, Trash2 } from "lucide-react";
import React from "react";

export const PasskeyItem: React.FC<{
  passkey: Passkey;
  deleting: string | null;
  onDelete: (id: string) => void;
}> = ({ passkey, deleting, onDelete }) => (
  <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-800 text-white">
    <div className="flex items-center gap-3">
      <Smartphone className="h-5 w-5 text-slate-400" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-white truncate">
            {passkey.description || "Unnamed Device"}
          </p>
          {passkey.deviceBrand && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {passkey.deviceBrand}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-slate-400">
            Added {new Date(passkey.createdAt).toLocaleDateString()}
          </p>
          <span className="text-slate-600">•</span>
          <p className="text-xs text-slate-400">
            {passkey.lastUsedAt
              ? `Last used ${new Date(passkey.lastUsedAt).toLocaleDateString()}`
              : "Never used"}
          </p>
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="bg-slate-700 text-slate-300">
        ID: {passkey.credentialId?.slice(0, 8) || passkey.id?.slice(0, 8) || "unknown"}...
      </Badge>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => onDelete(passkey.credentialId || passkey.id)}
        disabled={deleting === (passkey.credentialId || passkey.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export const UnauthenticatedView = () => (
  <Card>
    <CardContent className="flex items-center justify-center py-8">
      <p className="text-muted-foreground">Please log in to manage passkeys.</p>
    </CardContent>
  </Card>
);

export const PasskeyManagementContent: React.FC<{
  loading: boolean;
  passkeys: Passkey[];
  deleting: string | null;
  onDelete: (id: string) => void;
}> = ({ loading, passkeys, deleting, onDelete }) => (
  <CardContent>
    {loading ? (
      <p>Loading passkeys...</p>
    ) : passkeys.length === 0 ? (
      <p className="text-muted-foreground">No passkeys registered yet.</p>
    ) : (
      <div className="space-y-4">
        {passkeys.map((passkey, index) => (
          <PasskeyItem
            key={passkey.credentialId || passkey.id || `pk-${index}`}
            passkey={passkey}
            deleting={deleting}
            onDelete={onDelete}
          />
        ))}
      </div>
    )}
  </CardContent>
);
