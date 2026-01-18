'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import React from 'react';

interface PaginationProps {
    currentPage: number;
    totalLogs: number;
    pageSize: number;
    loading: boolean;
    setCurrentPage: (page: number | ((prev: number) => number)) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ currentPage, totalLogs, pageSize, loading, setCurrentPage }) => {
    const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
    
    return (
        <div className="border-t p-4 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground font-medium order-2 sm:order-1">
                Showing <span className="text-foreground font-bold">{((currentPage - 1) * pageSize) + 1}</span> to{' '}
                <span className="text-foreground font-bold">{Math.min(currentPage * pageSize, totalLogs)}</span> of{' '}
                <span className="text-foreground font-bold">{totalLogs}</span> entries
            </div>
            
            <div className="flex items-center gap-1 order-1 sm:order-2">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage === 1 || loading}>
                    <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1 || loading}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center px-4 h-8 bg-background border rounded-md text-xs font-bold shadow-sm">
                    Page {currentPage} of {totalPages}
                </div>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage >= totalPages || loading}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages || loading}>
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
};
