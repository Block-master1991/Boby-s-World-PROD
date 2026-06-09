"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { LogEntry } from "@/hooks/misc/useLoggerDashboardModules";
import React from "react";
import { LogTableRow } from "./LogTableRow";

interface LogTableProps {
  logs: LogEntry[];
  loading: boolean;
}

export const LogTable: React.FC<LogTableProps> = ({ logs, loading }) => (
  <div className="hidden md:block overflow-x-auto">
    <table className="w-full text-sm border-t">
      <thead className="bg-muted/50 text-muted-foreground border-b uppercase text-[10px] font-bold tracking-wider">
        <tr>
          {["Timestamp", "Level", "Type", "Message", "Metadata"].map(h => (
            <th
              key={h}
              className={`p-4 text-left ${h === "Message" ? "min-w-[300px]" : h === "Metadata" ? "w-[350px]" : ""}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {loading && logs.length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td colSpan={5} className="p-4">
                <Skeleton className="h-10 w-full" />
              </td>
            </tr>
          ))
        ) : logs.length === 0 ? (
          <tr>
            <td colSpan={5} className="p-12 text-center text-muted-foreground italic">
              No logs found
            </td>
          </tr>
        ) : (
          logs.map((log, idx) => <LogTableRow key={idx} log={log} />)
        )}
      </tbody>
    </table>
  </div>
);
