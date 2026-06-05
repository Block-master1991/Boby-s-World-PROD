"use client";

import { PasskeyOnboardingModal } from "@/components/auth/PasskeyOnboardingModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminPasskeyEnrollment } from "@/hooks/useAdminPasskeyEnrollment";
import { AlertTriangle, Key, Shield } from "lucide-react";
import React from "react";

const UnauthenticatedState: React.FC = () => (
  <Card>
    <CardContent className="flex items-center justify-center py-8">
      <p className="text-muted-foreground">Please log in to access admin features.</p>
    </CardContent>
  </Card>
);

const SecurityRequirements: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-start gap-3">
      <Key className="h-5 w-5 text-blue-500 mt-0.5" />
      <div>
        <p className="font-medium">Enhanced Admin Security</p>
        <p className="text-sm text-muted-foreground">
          Biometric authentication provides an extra layer of protection for admin accounts.
        </p>
      </div>
    </div>
    <div className="flex items-start gap-3">
      <Shield className="h-5 w-5 text-green-500 mt-0.5" />
      <div>
        <p className="font-medium">Compliance & Auditing</p>
        <p className="text-sm text-muted-foreground">
          Ensures all admin actions are properly authenticated and logged.
        </p>
      </div>
    </div>
  </div>
);

const EnrollmentCard: React.FC<{ onSetup: () => void; onReturn: () => void }> = ({
  onSetup,
  onReturn,
}) => (
  <Card className="max-w-2xl mx-auto">
    <CardHeader className="text-center">
      <CardTitle className="flex items-center justify-center gap-2 text-red-600">
        <Shield className="h-6 w-6" />
        Admin Security Setup Required
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-6">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          As an administrator, you must set up biometric authentication (Passkey) to access admin
          features. This is a security requirement to protect sensitive administrative functions.
        </AlertDescription>
      </Alert>
      <SecurityRequirements />
      <div className="flex gap-4">
        <Button onClick={onSetup} className="flex-1">
          <Key className="h-4 w-4 mr-2" />
          Set Up Admin Passkey
        </Button>
        <Button variant="outline" onClick={onReturn} className="flex-1">
          Return to Home
        </Button>
      </div>
    </CardContent>
  </Card>
);

export const AdminPasskeyEnrollment: React.FC = () => {
  const {
    isAuthenticated,
    isModalOpen,
    setIsModalOpen,
    handlePasskeyRegistered,
    handleCloseModal,
    router,
  } = useAdminPasskeyEnrollment();

  if (!isAuthenticated) return <UnauthenticatedState />;

  return (
    <div className="container mx-auto py-8">
      <EnrollmentCard onSetup={() => setIsModalOpen(true)} onReturn={() => router.push("/")} />
      <PasskeyOnboardingModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onPasskeyRegistered={handlePasskeyRegistered}
      />
    </div>
  );
};
