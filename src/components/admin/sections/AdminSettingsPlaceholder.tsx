"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

export function AdminSettingsPlaceholder() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Card className="border-dashed border-2 border-muted-foreground/20">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Settings className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>System Settings</CardTitle>
          <CardDescription>Configure system parameters and preferences</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground mb-4">
            System configuration options are under development.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Badge variant="outline" className="text-xs">
              Game Parameters
            </Badge>
            <Badge variant="outline" className="text-xs">
              Economy Settings
            </Badge>
            <Badge variant="outline" className="text-xs">
              Server Config
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
