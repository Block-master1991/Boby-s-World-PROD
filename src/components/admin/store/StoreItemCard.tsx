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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoreItem } from "@/hooks/store/useStoreItemsManagement";
import { Edit, Trash2 } from "lucide-react";
import Image from "next/image";
import React from "react";

interface StoreItemCardProps {
  item: StoreItem;
  onEdit: (item: StoreItem) => void;
  onDelete: (item: StoreItem) => void;
}

export const StoreItemCard: React.FC<StoreItemCardProps> = ({ item, onEdit, onDelete }) => (
  <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-muted/50">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 border rounded-md overflow-hidden bg-muted shadow-inner">
            {item.image && (
              <Image
                src={item.image}
                alt={item.name}
                fill
                className="object-cover transition-transform group-hover:scale-110"
              />
            )}
          </div>
          <div>
            <CardTitle className="text-lg font-bold">{item.name}</CardTitle>
            <p className="text-[10px] text-muted-foreground font-mono">{item.id}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onEdit(item)}>
            <Edit className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-500 hover:border-red-200"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Item</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{item.name}"?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(item)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground mb-4 line-clamp-2 h-10">{item.description}</p>
      <div className="flex items-center justify-between">
        <p className="font-extrabold text-xl font-mono text-primary">${item.price.toFixed(3)}</p>
        <div className="flex gap-1">
          <Badge variant="outline" className="capitalize text-[10px] py-0">
            {item.type}
          </Badge>
          <Badge variant={item.isActive ? "default" : "secondary"} className="text-[10px] py-0">
            {item.isActive ? "Active" : "Hidden"}
          </Badge>
        </div>
      </div>
    </CardContent>
  </Card>
);
