"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLoggerDashboard } from "@/hooks/misc/useLoggerDashboard";
import { LogFilters } from "./logger/LogFilters";
import { LogMobileView } from "./logger/LogMobileView";
import { LogTable } from "./logger/LogTable";
import { Pagination } from "./logger/Pagination";
import { StatsCards } from "./logger/StatsCards";

export function LoggerDashboard() {
  const {
    logs,
    stats,
    loading,
    totalLogs,
    filterLevel,
    setFilterLevel,
    filterType,
    setFilterType,
    searchText,
    setSearchText,
    autoRefresh,
    setAutoRefresh,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    fetchLogs,
  } = useLoggerDashboard();

  const resetPage = () => setCurrentPage(1);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <StatsCards stats={stats} />

      <LogFilters
        searchText={searchText}
        setSearchText={setSearchText}
        pageSize={pageSize}
        setPageSize={setPageSize}
        filterLevel={filterLevel}
        setFilterLevel={setFilterLevel}
        filterType={filterType}
        setFilterType={setFilterType}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        fetchLogs={fetchLogs}
        loading={loading}
        onResetPage={resetPage}
      />

      <Card>
        <CardHeader>
          <CardTitle>System Logs</CardTitle>
          <CardDescription>Real-time stream of all system events</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <LogTable logs={logs} loading={loading} />
          <LogMobileView logs={logs} loading={loading} />
        </CardContent>
        {logs.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalLogs={totalLogs}
            pageSize={pageSize}
            loading={loading}
            setCurrentPage={setCurrentPage}
          />
        )}
      </Card>
    </div>
  );
}
