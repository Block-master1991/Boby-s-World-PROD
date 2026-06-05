"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StoreItemFormData } from "@/hooks/useStoreItemsManagement";
import { Database, ImageIcon, Package, Plus, RefreshCw } from "lucide-react";
import React from "react";
import { StoreItemForm } from "./StoreItemForm";

const HeaderInfo = () => (
  <div className="flex items-center gap-3">
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
      <Package className="h-6 w-6 text-white" />
    </div>
    <div>
      <h2 className="text-2xl font-extrabold tracking-tight">Store Management</h2>
      <p className="text-sm text-muted-foreground">Control items, prices, and system maintenance</p>
    </div>
  </div>
);

const MaintenanceTools = (p: {
  onInit: () => void;
  i: boolean;
  onMI: () => void;
  m: boolean;
  onMImg: () => void;
  mi: boolean;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className="h-9 px-3">
        <Database className="h-4 w-4 mr-2" /> Maintenance
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel>System Tools</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={p.onInit} disabled={p.i}>
        <RefreshCw className="h-4 w-4 mr-2" /> Initialize Defaults
      </DropdownMenuItem>
      <DropdownMenuItem onClick={p.onMI} disabled={p.m}>
        <Database className="h-4 w-4 mr-2" /> Migrate Inventories
      </DropdownMenuItem>
      <DropdownMenuItem onClick={p.onMImg} disabled={p.mi}>
        <ImageIcon className="h-4 w-4 mr-2" /> Migrate Images
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export const StoreManagementHeader: React.FC<{
  loading: boolean;
  initializing: boolean;
  migrating: boolean;
  migratingImages: boolean;
  uploading: boolean;
  isDialogOpen: boolean;
  setIsDialogOpen: (o: boolean) => void;
  formData: StoreItemFormData;
  setFormData: (d: StoreItemFormData) => void;
  isEditing: boolean;
  onRefresh: () => void;
  onInitialize: () => void;
  onMigrateInventory: () => void;
  onMigrateImages: () => void;
  onImageUpload: (f: File) => void;
  onSave: () => void;
  onResetForm: () => void;
}> = p => (
  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <HeaderInfo />
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={p.onRefresh}
        disabled={p.loading}
        variant="outline"
        size="sm"
        className="h-9 px-3"
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${p.loading ? "animate-spin" : ""}`} /> Sync
      </Button>
      <MaintenanceTools
        onInit={p.onInitialize}
        i={p.initializing}
        onMI={p.onMigrateInventory}
        m={p.migrating}
        onMImg={p.onMigrateImages}
        mi={p.migratingImages}
      />
      <Dialog open={p.isDialogOpen} onOpenChange={p.setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            onClick={p.onResetForm}
            size="sm"
            className="h-9 px-4 bg-primary shadow-md hover:shadow-lg transition-all"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Item
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {p.isEditing ? "Edit Store Item" : "New Store Item"}
            </DialogTitle>
          </DialogHeader>
          <StoreItemForm
            formData={p.formData}
            setFormData={p.setFormData}
            isEditing={p.isEditing}
            uploading={p.uploading}
            onImageUpload={p.onImageUpload}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => p.setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={p.onSave} className="px-8 font-bold">
              {p.isEditing ? "Update" : "Create"} Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </div>
);
