"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export function AdminUsersPlaceholder() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Card className="border-dashed border-2 border-muted-foreground/20">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Manage user accounts, permissions, and player data</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground mb-4">
            User management features are under development.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Badge variant="outline" className="text-xs">
              Search Users
            </Badge>
            <Badge variant="outline" className="text-xs">
              Ban Management
            </Badge>
            <Badge variant="outline" className="text-xs">
              Activity History
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
