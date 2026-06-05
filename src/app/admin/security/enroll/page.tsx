"use client";

import React from "react";
import { AdminPasskeyEnrollment } from "@/components/admin/AdminPasskeyEnrollment";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export default function AdminEnrollmentPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <Card className="border-amber-500/20 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
              <ShieldAlert className="text-amber-500 w-6 h-6" />
            </div>
            <CardTitle className="text-2xl font-bold">Security Required</CardTitle>
            <CardDescription>
              Administrative access requires biometric authentication. Please enroll a passkey to
              continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              }
            >
              <AdminPasskeyEnrollment />
            </React.Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
