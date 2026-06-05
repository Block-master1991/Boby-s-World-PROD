"use client";

import { DeleteConfirmModal } from "@/components/admin/DeleteConfirmModal";
import { IpControls } from "@/components/admin/sections/IpControls";
import { IpManagementGrid } from "@/components/admin/sections/IpManagementGrid";
import { SecurityBiometrics } from "@/components/admin/sections/SecurityBiometrics";
import { SecurityHeader } from "@/components/admin/sections/SecurityHeader";
import { useSecuritySectionLogic } from "@/components/admin/sections/useSecuritySectionLogic";
import { Card, CardContent } from "@/components/ui/card";

export function SecuritySection() {
  const logic = useSecuritySectionLogic();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Card>
        <SecurityHeader />
        <CardContent className="space-y-6">
          <SecurityMessage message={logic.message} />
          <IpControls
            search={logic.search}
            setSearch={logic.setSearch}
            newIp={logic.newIp}
            setNewIp={logic.setNewIp}
            targetList={logic.targetList}
            setTargetList={logic.setTargetList}
            loading={logic.loading}
            onAddIp={logic.handleAddIp}
            resetPagination={logic.resetPagination}
          />
          <IpManagementGrid
            whitelist={logic.whitelist}
            blacklist={logic.blacklist}
            loading={logic.loading}
            whitePage={logic.whitePage}
            blackPage={logic.blackPage}
            PAGE_SIZE={logic.PAGE_SIZE}
            getPaginatedList={logic.getPaginatedList}
            setWhitePage={logic.setWhitePage}
            setBlackPage={logic.setBlackPage}
            onConfirmDelete={(ip, list) => logic.setConfirmDelete({ ip, list })}
          />
          <SecurityBiometrics />
        </CardContent>
      </Card>
      {logic.confirmDelete && (
        <DeleteConfirmModal
          ip={logic.confirmDelete.ip}
          list={logic.confirmDelete.list}
          loading={logic.loading}
          onCancel={() => logic.setConfirmDelete(null)}
          onConfirm={logic.handleConfirmDelete}
        />
      )}
    </div>
  );
}

function SecurityMessage({
  message,
}: {
  message: { type: "success" | "error"; text: string } | null;
}) {
  if (!message) return null;
  return (
    <div
      className={`p-3 rounded-lg border flex items-center gap-2 ${message.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-600" : "bg-red-500/10 border-red-500/20 text-red-600"}`}
    >
      {message.type === "success" ? "✓" : "⚠"} {message.text}
    </div>
  );
}
