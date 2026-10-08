import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDown, ArrowUp, ChevronsLeft, ChevronsRight } from "lucide-react";

interface TransactionPaginationProps {
  showNavigation: boolean;
  page: number;
  totalPages: number;
  isDisabled: boolean;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (value: number) => void;
}

export const TransactionPagination: React.FC<TransactionPaginationProps> = ({
  showNavigation,
  page,
  totalPages,
  isDisabled,
  onPageChange,
  itemsPerPage,
  onItemsPerPageChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {showNavigation && (
        <div className="flex items-center justify-between md:justify-center p-4 border-t border-gray-200 dark:border-gray-700">
          {/* Mobile: simple prev / page-X-of-Y / next */}
          <div className="flex md:hidden items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(Math.max(page - 1, 1))}
              disabled={page === 1 || isDisabled}
            >
              <ArrowDown className="rotate-90 h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(Math.min(page + 1, totalPages))}
              disabled={page === totalPages || isDisabled}
            >
              <ArrowUp className="rotate-90 h-4 w-4" />
            </Button>
          </div>

          {/* Desktop: full page number buttons */}
          <div className="hidden md:flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(1)}
              disabled={page === 1 || isDisabled}
              title={t('First page')}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(Math.max(page - 1, 1))}
              disabled={page === 1 || isDisabled}
            >
              <ArrowDown className="rotate-90 h-4 w-4" />
            </Button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(Math.min(page + 1, totalPages))}
              disabled={page === totalPages || isDisabled}
            >
              <ArrowUp className="rotate-90 h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(totalPages)}
              disabled={page === totalPages || isDisabled}
              title={t('Last page')}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <div className="flex md:hidden items-center justify-end gap-2 p-2 text-sm text-muted-foreground border-t border-gray-200 dark:border-gray-700">
        <span>{t('Show')}</span>
        <Select
          value={String(itemsPerPage)}
          onValueChange={(value) => onItemsPerPageChange(Number(value))}
          disabled={isDisabled}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
            <SelectItem value="250">250</SelectItem>
            <SelectItem value="500">500</SelectItem>
          </SelectContent>
        </Select>
        <span>{t('per page')}</span>
      </div>
    </>
  );
};
