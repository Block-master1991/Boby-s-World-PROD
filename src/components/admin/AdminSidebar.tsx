'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { LogOut, PawPrint } from 'lucide-react';
import React from 'react';

interface AdminSidebarProps {
  menuItems: { id: string; label: string; icon: React.ElementType }[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  onLogout: () => void;
}

export function AdminSidebar({ menuItems, activeSection, setActiveSection, onLogout }: AdminSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset" className="border-r border-border/50">
      <AdminSidebarHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    onClick={() => setActiveSection(item.id)}
                    isActive={activeSection === item.id}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onLogout} variant="outline" tooltip="Logout">
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function AdminSidebarHeader() {
  return (
    <SidebarHeader className="border-b border-border/50 bg-sidebar">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
          <PawPrint className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col overflow-hidden transition-all group-data-[collapsible=icon]:hidden">
          <span className="font-bold text-lg truncate">Boby Admin</span>
          <p className="text-[10px] text-muted-foreground truncate">Control Panel</p>
        </div>
      </div>
    </SidebarHeader>
  );
}
