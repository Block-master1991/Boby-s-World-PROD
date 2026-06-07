"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import React from "react";

interface PasskeyRegistrationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  setDescription: (desc: string) => void;
  onRegister: () => void;
  registering: boolean;
}

export const PasskeyRegistrationDialog: React.FC<PasskeyRegistrationDialogProps> = ({
  isOpen,
  onOpenChange,
  description,
  setDescription,
  onRegister,
  registering,
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>
      <Button>
        <Plus className="h-4 w-4 mr-2" />
        Add Passkey
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Register New Passkey</DialogTitle>
        <DialogDescription>
          Enter a name for this passkey to help you identify it later
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label htmlFor="description">Device Description</Label>
          <Input
            id="description"
            placeholder="e.g., My iPhone, Work Laptop"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        <Button onClick={onRegister} disabled={registering} className="w-full">
          {registering ? "Registering..." : "Register Passkey"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);
