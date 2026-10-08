import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { Search, Plus, Undo, Redo, FilePenLine, Trash2, XCircle, Tag, ArrowUp, ArrowDown, ArrowUpDown, Layers, Merge, X, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ActionTooltip } from "@/components/ui/action-tooltip";

interface TransactionControlsProps {
  search: string;
  onSearchChange: (search: string) => void;
  onFilterClick: () => void;
  onAddTransactionClick: () => void;
  selectedCount: number;
  onDeleteSelected: () => void;
  onBatchEdit: () => void;
  onBatchTag: () => void;
  onCollapseSelected?: () => void;
  onExplodeSelected?: () => void;
  onMergeSelected?: () => void;
  selectedIsSplit?: boolean;
  onClearAllFilters: () => void;
  isAnyFilterActive: boolean;
  children: React.ReactNode;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // Record Payment button (credit-card accounts)
  showRecordPaymentButton?: boolean;
  onRecordPaymentClick?: () => void;
  // Sort props — used by the mobile-only sort dropdown (desktop has clickable column headers)
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, sortDirection: 'asc' | 'desc') => void;
}

const TransactionControls: React.FC<TransactionControlsProps> = React.memo(({
  search,
  onSearchChange,
  onFilterClick,
  onAddTransactionClick,
  selectedCount,
  onDeleteSelected,
  onBatchEdit,
  onBatchTag,
  onCollapseSelected,
  onExplodeSelected,
  onMergeSelected,
  selectedIsSplit,
  onClearAllFilters,
  isAnyFilterActive,
  children,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  showRecordPaymentButton,
  onRecordPaymentClick,
  sortBy,
  sortDirection,
  onSortChange,
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(search);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const debouncedSearchTerm = useDebounce(inputValue, 500);
  const isClearing = useRef(false);
  const hasInteracted = useRef(false);

  useEffect(() => {
    // If we're in the middle of clearing, ignore debounced updates with non-empty values
    if (isClearing.current && debouncedSearchTerm !== '') {
      return;
    }

    if (debouncedSearchTerm.length >= 2) {
      onSearchChange(debouncedSearchTerm);
    } else if (debouncedSearchTerm === '') {
      // Only propagate an empty search after the user has interacted — prevents the
      // 500ms debounce lag from wiping a URL-seeded search on initial mount.
      if (!hasInteracted.current) return;
      onSearchChange('');
      isClearing.current = false;
    } else if (search !== '') {
      // 1-char input after user interaction → clear active search
      if (!hasInteracted.current) return;
      onSearchChange('');
    }
  }, [debouncedSearchTerm, onSearchChange, search]);

  useEffect(() => {
    // Ensure input field is synchronized with search prop
    // This is especially important when parent clears search via "Clear All Filters"
    setInputValue(search);
  }, [search]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    hasInteracted.current = true;
    setInputValue(e.target.value);
  };

  const handleClearAllFilters = () => {
    // Set the clearing flag to ignore pending debounced updates
    isClearing.current = true;
    hasInteracted.current = true;

    // Clear the local input value immediately
    setInputValue("");

    // Call the parent's clear function which will also trigger onSearchChange("")
    onClearAllFilters();

    // Also immediately call onSearchChange to override any pending debounced calls
    onSearchChange("");
  };

  const canExplode = selectedCount === 1 && !!selectedIsSplit;
  const canCombine = canExplode || selectedCount >= 2;
  const selectHint = selectedCount === 0 ? t('Select at least one transaction') : undefined;
  const iconButtonClass = "hidden md:inline-flex h-8 w-8 p-0 border-0 hover:bg-gray-200";

  return (
    <TooltipProvider delayDuration={300}>
    <div className="bg-white dark:bg-gray-800 flex flex-nowrap items-center justify-between gap-y-1 px-2 md:px-4 py-1 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-1 md:gap-2 flex-1 md:flex-none md:shrink-0 min-w-0">
        {/* Add Transaction (desktop only) */}
        <ActionTooltip className="hidden md:inline-flex shrink-0" label={t('Add Transaction')}>
          <Button className="gap-0 group bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 hover:bg-blue-700 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white" size="sm" onClick={onAddTransactionClick}>
            <Plus className="h-4 w-4 mr-1 bg-blue-600 dark:bg-blue-400 text-white rounded-full p-1 group-hover:bg-white group-hover:text-blue-600" style={{ width: '18px', height: '18px' }} />
            <span className="hidden sm:inline text-xs">{t('Transaction')}</span>
          </Button>
        </ActionTooltip>

        {/* Mobile-only search — icon by default, expands on click */}
        <div className="md:hidden flex items-center gap-1 flex-1 min-w-0">
          {mobileSearchOpen ? (
            <>
              <div className="relative flex-1 min-w-0">
                <Input
                  type="text"
                  placeholder={t('Search...')}
                  value={inputValue}
                  onChange={handleSearch}
                  autoFocus
                  className="w-full pl-9 pr-2 py-1.5 text-sm h-8"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 flex-shrink-0"
                onClick={() => setMobileSearchOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-8 w-8 p-0', (search || inputValue) && 'text-blue-600 dark:text-blue-400')}
              onClick={() => setMobileSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Edit — desktop only (no selection on mobile) */}
        <ActionTooltip className="hidden md:inline-flex" label={t('Edit')} hint={selectHint}>
          <Button className={iconButtonClass} variant="outline" size="sm" disabled={selectedCount === 0} onClick={onBatchEdit} aria-label={t('Edit')}>
            <FilePenLine className="h-4 w-4" />
          </Button>
        </ActionTooltip>
        {/* Tag — desktop only */}
        <ActionTooltip className="hidden md:inline-flex" label={t('Tag')} hint={selectHint}>
          <Button className={iconButtonClass} variant="outline" size="sm" disabled={selectedCount === 0} onClick={onBatchTag} aria-label={t('Tag')}>
            <Tag className="h-4 w-4" />
          </Button>
        </ActionTooltip>
        {/* Undo — desktop only */}
        <ActionTooltip className="hidden md:inline-flex" label={t('Undo')}>
          <Button className={iconButtonClass} variant="outline" size="sm" disabled={!canUndo} onClick={onUndo} aria-label={t('Undo')}>
            <Undo className="h-4 w-4" />
          </Button>
        </ActionTooltip>
        {/* Redo — desktop only */}
        <ActionTooltip className="hidden md:inline-flex" label={t('Redo')}>
          <Button className={iconButtonClass} variant="outline" size="sm" disabled={!canRedo} onClick={onRedo} aria-label={t('Redo')}>
            <Redo className="h-4 w-4" />
          </Button>
        </ActionTooltip>
        {/* Delete — desktop only */}
        <ActionTooltip className="hidden md:inline-flex" label={t('Delete')} hint={selectHint}>
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex h-8 w-8 p-0 bg-white dark:bg-gray-700 dark:text-gray-300 hover:text-white hover:bg-red-600 dark:hover:bg-red-600 border-0"
            disabled={selectedCount === 0}
            onClick={onDeleteSelected}
            aria-label={t('Delete')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </ActionTooltip>

        {/* More actions (Combine/Explode, Merge) — desktop only */}
        <DropdownMenu>
          <ActionTooltip className="hidden md:inline-flex" label={t('More actions')}>
            <DropdownMenuTrigger asChild>
              <Button className={iconButtonClass} variant="outline" size="sm" aria-label={t('More actions')}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </ActionTooltip>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={!canCombine} onSelect={canExplode ? onExplodeSelected : onCollapseSelected}>
              <Layers className="h-4 w-4 mr-2" />
              <div className="flex flex-col">
                <span>{canExplode ? t('Explode') : t('Combine')}</span>
                {!canCombine && <span className="text-xs text-muted-foreground">{t('Select 2 or more transactions')}</span>}
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={selectedCount !== 2} onSelect={onMergeSelected}>
              <Merge className="h-4 w-4 mr-2" />
              <div className="flex flex-col">
                <span>{t('Merge')}</span>
                {selectedCount !== 2 && <span className="text-xs text-muted-foreground">{t('Select exactly 2 transactions')}</span>}
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1 md:gap-2 md:flex-1 md:min-w-0 md:justify-end">
        {/* Record Payment (desktop only, credit-card accounts) */}
        {showRecordPaymentButton && (
          <ActionTooltip className="hidden md:inline-flex shrink-0" label={t('Record Credit Card Payment')}>
            <Button
              className="gap-0 group bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 hover:bg-green-700 hover:text-white dark:hover:bg-green-600"
              size="sm"
              onClick={onRecordPaymentClick}
            >
              <Plus className="h-4 w-4 mr-1 bg-green-600 text-white rounded-full p-1 group-hover:bg-white group-hover:text-green-600" style={{ width: '18px', height: '18px' }} />
              <span className="text-xs">{t('Payment')}</span>
            </Button>
          </ActionTooltip>
        )}

        {/* Search — desktop only (mobile search lives in the left group) */}
        <div className="relative hidden md:block flex-1 min-w-[8rem] max-w-64">
          <Input
            type="text"
            placeholder={t('Search...')}
            value={inputValue}
            onChange={handleSearch}
            className="w-full pl-9 pr-2 py-1.5 text-sm h-8"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 h-8" />
        </div>

        {/* Filter Button */}
        {children}

        <ActionTooltip label={t('Clear Filters')}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-9 p-0 border-none hover:bg-transparent"
            onClick={handleClearAllFilters}
            disabled={!isAnyFilterActive}
            aria-label={t('Clear Filters')}
          >
            <XCircle className="!h-5 !w-5" />
          </Button>
        </ActionTooltip>

        {/* Sort button — mobile only (desktop has clickable column headers) */}
        {onSortChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden h-8 w-9 p-0 border-none hover:bg-transparent"
                aria-label={t('Sort transactions')}
              >
                {sortDirection === 'asc'
                  ? <ArrowUp className="!h-5 !w-5" />
                  : sortDirection === 'desc'
                    ? <ArrowDown className="!h-5 !w-5" />
                    : <ArrowUpDown className="!h-5 !w-5" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {[
                { field: 'payment_date', label: t('Date') },
                { field: 'payee', label: t('Payee') },
                { field: 'amount', label: t('Amount') },
              ].map(opt => (
                <DropdownMenuItem
                  key={opt.field}
                  onClick={() => onSortChange(opt.field, sortBy === opt.field && sortDirection === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center justify-between gap-4"
                >
                  <span>{opt.label}</span>
                  {sortBy === opt.field && (
                    sortDirection === 'asc'
                      ? <ArrowUp className="h-4 w-4" />
                      : <ArrowDown className="h-4 w-4" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
});

export default TransactionControls;
