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
import type { StoreItemDocument } from "@/types/database";
import { Edit, Trash2 } from "lucide-react";
import Image from "next/image";

interface DeleteItemDialogProps {
  itemName: string;
  onDelete: () => void;
}

function DeleteItemDialog({ itemName, onDelete }: DeleteItemDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Item</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{itemName}&quot;? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-red-500 hover:bg-red-600">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ItemHeader({ item, onEdit, onDelete }: AdminItemCardProps) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <Image
          src={item.image}
          alt={item.name}
          width={48}
          height={48}
          className="rounded-md border"
        />
        <div>
          <CardTitle className="text-lg">{item.name}</CardTitle>
          <p className="text-sm text-muted-foreground">ID: {item.id}</p>
        </div>
      </div>

      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => onEdit(item)}>
          <Edit className="h-4 w-4" />
        </Button>
        <DeleteItemDialog itemName={item.name} onDelete={() => onDelete(item.id)} />
      </div>
    </div>
  );
}

function ItemDetails({ item }: { item: StoreItemDocument }) {
  return (
    <>
      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{item.description}</p>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-semibold">{item.price} coins</p>
          <p className="text-sm text-muted-foreground">${item.usdPrice}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={item.type === "consumable" ? "default" : "secondary"}>{item.type}</Badge>
          <Badge
            variant={
              item.rarity === "common"
                ? "outline"
                : item.rarity === "rare"
                  ? "default"
                  : item.rarity === "epic"
                    ? "destructive"
                    : "default"
            }
          >
            {item.rarity}
          </Badge>
        </div>
      </div>
    </>
  );
}

interface AdminItemCardProps {
  item: StoreItemDocument;
  onEdit: (item: StoreItemDocument) => void;
  onDelete: (itemId: string) => void;
}

export function AdminItemCard({ item, onEdit, onDelete }: AdminItemCardProps) {
  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <ItemHeader item={item} onEdit={onEdit} onDelete={onDelete} />
      </CardHeader>
      <CardContent>
        <ItemDetails item={item} />
        <div className="flex items-center justify-between">
          <Badge variant={item.isActive ? "default" : "secondary"}>
            {item.isActive ? "Active" : "Inactive"}
          </Badge>
          <p className="text-xs text-muted-foreground">
            Updated: {new Date(item.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
