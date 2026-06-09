"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { usePasskeyManagement } from "@/hooks/passkey/usePasskeyManagement";
import { Shield } from "lucide-react";
import React from "react";
import { PasskeyManagementContent, UnauthenticatedView } from "./PasskeyManagementComponents";
import { PasskeyRegistrationDialog } from "./PasskeyRegistrationDialog";

export const PasskeyManagement: React.FC<{ onPasskeyRegistered?: () => void }> = ({
  onPasskeyRegistered,
}) => {
  const {
    passkeys,
    loading,
    registering,
    deleting,
    description,
    setDescription,
    isDialogOpen,
    setIsDialogOpen,
    registerNewPasskey,
    deletePasskey,
    isAuthenticated,
  } = usePasskeyManagement(onPasskeyRegistered);

  if (!isAuthenticated) return <UnauthenticatedView />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" /> Passkey Management
        </CardTitle>
        <PasskeyRegistrationDialog
          isOpen={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          description={description}
          setDescription={setDescription}
          onRegister={registerNewPasskey}
          registering={registering}
        />
      </CardHeader>
      <PasskeyManagementContent
        loading={loading}
        passkeys={passkeys}
        deleting={deleting}
        onDelete={deletePasskey}
      />
    </Card>
  );
};
