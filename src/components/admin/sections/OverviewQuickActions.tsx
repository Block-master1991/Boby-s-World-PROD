"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Package, Settings, Shield } from "lucide-react";

interface OverviewQuickActionsProps {
  setActiveSection: (section: string) => void;
}

export function OverviewQuickActions({ setActiveSection }: OverviewQuickActionsProps) {
  return (
    <Card className="relative overflow-hidden border-border/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-purple-500/20 to-transparent rounded-bl-full"></div>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Settings className="h-4 w-4 text-purple-500" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => setActiveSection("items")}
          >
            <Package className="h-4 w-4 mr-2" />
            Manage Store Items
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => setActiveSection("security")}
          >
            <Shield className="h-4 w-4 mr-2" />
            Security Settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => setActiveSection("logs")}
          >
            <FileText className="h-4 w-4 mr-2" />
            View Logs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
