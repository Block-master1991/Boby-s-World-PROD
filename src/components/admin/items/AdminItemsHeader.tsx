"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

interface MigrationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isMigrating: boolean;
  onMigrate: () => void;
}

function MigrationDialog({ isOpen, onOpenChange, isMigrating, onMigrate }: MigrationDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button disabled={isMigrating} variant="destructive">
          <RefreshCw className={`h-4 w-4 mr-2 ${isMigrating ? "animate-spin" : ""}`} />
          Migrate Inventory
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Run Inventory Migration?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to run the inventory migration? This will convert all user
            inventories from the old format to the new format. Make sure you have a backup of your
            database!
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onMigrate} className="bg-red-500 hover:bg-red-600">
            Run Migration
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ItemDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  onResetForm: () => void;
  children: ReactNode;
}

function ItemDialog({ isOpen, onOpenChange, isEditing, onResetForm, children }: ItemDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button onClick={onResetForm}>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Item" : "Add New Item"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Edit the item details below" : "Add a new item to the store"}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

interface AdminItemsHeaderProps {
  loading: boolean;
  initializing: boolean;
  migrating: boolean;
  onInitialize: () => void;
  onRefresh: () => void;
  onMigrate: () => void;
  onResetForm: () => void;
  isDialogOpen: boolean;
  setIsDialogOpen: (open: boolean) => void;
  isMigrationDialogOpen: boolean;
  setIsMigrationDialogOpen: (open: boolean) => void;
  children: ReactNode;
  editingItem: boolean;
}

export function AdminItemsHeader(props: AdminItemsHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-3xl font-bold">Store Items Management</h1>
        <p className="text-muted-foreground">Manage store items, prices, and availability</p>
      </div>

      <div className="flex gap-2">
        <Button onClick={props.onInitialize} disabled={props.initializing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${props.initializing ? "animate-spin" : ""}`} />
          Initialize Items
        </Button>

        <Button onClick={props.onRefresh} disabled={props.loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${props.loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        <MigrationDialog
          isOpen={props.isMigrationDialogOpen}
          onOpenChange={props.setIsMigrationDialogOpen}
          isMigrating={props.migrating}
          onMigrate={props.onMigrate}
        />

        <ItemDialog
          isOpen={props.isDialogOpen}
          onOpenChange={props.setIsDialogOpen}
          isEditing={props.editingItem}
          onResetForm={props.onResetForm}
        >
          {props.children}
        </ItemDialog>
      </div>
    </div>
  );
}
