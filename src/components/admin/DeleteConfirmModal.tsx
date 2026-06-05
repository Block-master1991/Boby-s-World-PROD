"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2 } from "lucide-react";

interface DeleteConfirmModalProps {
  ip: string;
  list: "whitelist" | "blacklist";
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({
  ip,
  list,
  loading,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200">
      <Card className="w-full max-w-md mx-4 shadow-2xl border-destructive/20">
        <CardHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
            <Trash2 className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-center">Confirm Deletion</CardTitle>
          <CardDescription className="text-center">
            Are you sure you want to remove IP{" "}
            <span className="font-mono font-bold text-foreground">{ip}</span> from the{" "}
            <span className="font-semibold text-foreground">{list}</span>?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={loading}>
              {loading ? "Deleting..." : "Yes, Delete"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
