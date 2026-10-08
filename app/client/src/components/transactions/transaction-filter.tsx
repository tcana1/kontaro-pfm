
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { useFinance } from '@/contexts/finance-context';
import type { Account, Tag } from '@shared/schema';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { useIsMobile } from '@/hooks/use-mobile';

type FilterType = 'status' | 'categories' | 'accounts' | 'ignored' | 'tags';

export interface ActiveFilters {
  status?: string[];
  categories?: number[];
  accounts?: number[];
  tags?: number[];
  ignored?: boolean[];
  dateRange?: {
    from: Date;
    to?: Date;
  };
}

interface TransactionFilterProps {
  activeFilters: ActiveFilters;
  onApplyFilters: (filters: ActiveFilters) => void;
  activeFilterCount: number;
}

const TransactionFilter: React.FC<TransactionFilterProps> = ({ activeFilters, onApplyFilters, activeFilterCount }) => {
  const { t } = useTranslation();
  const { categories, accounts, categoryGroups } = useFinance();
  const { data: tags = [] } = useServiceQuery<Tag[]>('tags');
  const [draftFilters, setDraftFilters] = useState<ActiveFilters>(activeFilters);
  const [isOpen, setIsOpen] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [accountsExpanded, setAccountsExpanded] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isOpen) {
      setDraftFilters(JSON.parse(JSON.stringify(activeFilters)));
    }
  }, [isOpen, activeFilters]);

  const handleCheckboxChange = (type: FilterType, value: string | number, checked: boolean) => {
    setDraftFilters(prev => {
      const newFilters = { ...prev };
      const currentValues = newFilters[type] || [];
      if (checked) {
        // @ts-ignore
        newFilters[type] = [...currentValues, value];
      } else {
        // @ts-ignore
        newFilters[type] = currentValues.filter(item => item !== value);
      }
      return newFilters;
    });
  };

  const handleLabelClick = (type: FilterType, value: string | number) => {
    const preserved: Partial<ActiveFilters> = {};
    if (activeFilters.dateRange) preserved.dateRange = activeFilters.dateRange;
    onApplyFilters({ ...preserved, [type]: [value] });
    setIsOpen(false);
  };

  const handleApply = () => {
    onApplyFilters(draftFilters);
    setIsOpen(false);
  };

  const handleClear = () => {
    setDraftFilters({});
    onApplyFilters({});
  };

  // ── shared helpers ────────────────────────────────────────────────────────

  const renderDropdownItem = (type: FilterType, item: { id: string | number; name: string }, className = '') => (
    <DropdownMenuItem key={item.id} onSelect={(e) => e.preventDefault()} className="p-0">
      <label className="flex items-center w-full px-2 py-1.5 text-sm cursor-pointer">
        <Checkbox
          id={`${type}-${item.id}`}
          // @ts-ignore
          checked={draftFilters[type]?.includes(item.id)}
          onCheckedChange={(checked) => handleCheckboxChange(type, item.id, !!checked)}
          className="mr-2"
        />
        <span className={`flex-grow ${className}`} onClick={() => handleLabelClick(type, item.id)}>
          {item.name}
        </span>
      </label>
    </DropdownMenuItem>
  );

  const renderSheetCheckbox = (type: FilterType, item: { id: string | number; name: string }, className = '') => (
    <label key={item.id} className={`flex items-center gap-3 py-2 px-1 cursor-pointer text-sm ${className}`}>
      <Checkbox
        // @ts-ignore
        checked={draftFilters[type]?.includes(item.id)}
        onCheckedChange={(checked) => handleCheckboxChange(type, item.id, !!checked)}
      />
      <span className="flex-grow" onClick={() => handleLabelClick(type, item.id)}>
        {item.name}
      </span>
    </label>
  );

  const isAccountsFilterActive = activeFilters.accounts && activeFilters.accounts.length > 0;
  const isCategoriesFilterActive = activeFilters.categories && activeFilters.categories.length > 0;
  const isTagsFilterActive = activeFilters.tags && activeFilters.tags.length > 0;
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const triggerButton = (
    <Button variant="ghost" className={activeFilterCount > 0 ? 'border-blue-500 gap-0 h-8' : 'gap-0 h-8'}>
      <Filter className="h-4 w-4" />
      {activeFilterCount > 0 && (
        <span className="ml-2 h-5 w-5 flex items-center justify-center rounded-full bg-blue-500 text-white text-xs">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  // ── Mobile: bottom Sheet ──────────────────────────────────────────────────

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-2">
            <SheetTitle>{t("Filter Transactions")}</SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 px-6">
            {/* Status */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-1">{t("Status")}</p>
            {[
              { id: 'Pending', name: t('Pending') },
              { id: 'Cleared', name: t('Cleared') },
            ].map(s => renderSheetCheckbox('status', s))}
            {renderSheetCheckbox('ignored', { id: true as any, name: t('Ignored') })}

            <div className="border-t my-3" />

            {/* Uncategorized — hoisted out of the drilldown for one-click access */}
            {categories.find(c => c.id === 0) && (
              renderSheetCheckbox('categories', categories.find(c => c.id === 0)!)
            )}

            {/* Categories collapsible */}
            <button
              className="flex items-center justify-between w-full py-2 text-sm font-medium"
              onClick={() => setCategoriesExpanded(v => !v)}
            >
              <span className={isCategoriesFilterActive ? 'text-blue-500' : ''}>
                {isCategoriesFilterActive && <span className="inline-block h-2 w-2 bg-blue-500 rounded-full mr-2" />}
                {t("Categories")}
              </span>
              {categoriesExpanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {categoriesExpanded && (
              <div className="pl-2 mb-2">
                {[...categoryGroups].sort((a, b) => {
                  if (a.id <= 0 && b.id > 0) return 1;
                  if (b.id <= 0 && a.id > 0) return -1;
                  return a.name.localeCompare(b.name);
                }).map(group => (
                  <React.Fragment key={group.id}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-1">
                      {group.name}
                    </p>
                    {categories
                      .filter(c => c.group_id === group.id && c.id !== 0)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(cat => renderSheetCheckbox('categories', cat, 'ml-2'))}
                  </React.Fragment>
                ))}
              </div>
            )}

            <div className="border-t my-3" />

            {/* Tags collapsible */}
            {(tags as Tag[]).length > 0 && (
              <>
                <button
                  className="flex items-center justify-between w-full py-2 text-sm font-medium"
                  onClick={() => setTagsExpanded(v => !v)}
                >
                  <span className={isTagsFilterActive ? 'text-blue-500' : ''}>
                    {isTagsFilterActive && <span className="inline-block h-2 w-2 bg-blue-500 rounded-full mr-2" />}
                    {t("Tags")}
                  </span>
                  {tagsExpanded
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                {tagsExpanded && (
                  <div className="pl-2 mb-2">
                    {[...(tags as Tag[])].sort((a, b) => a.name.localeCompare(b.name)).map(tag => (
                      <label key={tag.id} className="flex items-center gap-3 py-2 px-1 cursor-pointer text-sm">
                        <Checkbox
                          checked={draftFilters.tags?.includes(tag.id) || false}
                          onCheckedChange={(checked) => handleCheckboxChange('tags', tag.id, !!checked)}
                        />
                        <span className="flex items-center gap-2 flex-grow" onClick={() => handleLabelClick('tags', tag.id)}>
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="border-t my-3" />
              </>
            )}

            {/* Accounts collapsible */}
            <button
              className="flex items-center justify-between w-full py-2 text-sm font-medium"
              onClick={() => setAccountsExpanded(v => !v)}
            >
              <span className={isAccountsFilterActive ? 'text-blue-500' : ''}>
                {isAccountsFilterActive && <span className="inline-block h-2 w-2 bg-blue-500 rounded-full mr-2" />}
                {t("Accounts")}
              </span>
              {accountsExpanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {accountsExpanded && (
              <div className="pl-2 mb-2">
                {accounts
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(acc => renderSheetCheckbox('accounts', acc))}
              </div>
            )}

            {/* bottom padding so last item isn't hidden behind the footer */}
            <div className="h-4" />
          </ScrollArea>

          <div className="flex justify-between gap-3 px-6 py-4 border-t">
            <Button variant="ghost" className="flex-1" onClick={handleClear}>{t("Clear All")}</Button>
            <Button className="flex-1" onClick={handleApply}>{t("Apply")}</Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // ── Desktop: DropdownMenu (unchanged) ────────────────────────────────────

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <ActionTooltip label={t('Filters')}>
        <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
      </ActionTooltip>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>{t("Filter Transactions")}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Status Section */}
        <DropdownMenuLabel>{t("Status")}</DropdownMenuLabel>
        {[
          { id: 'Pending', name: t('Pending') },
          { id: 'Cleared', name: t('Cleared') },
        ].map(status => renderDropdownItem('status', status))}

        {/* Ignored Filter */}
        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="p-0">
          <label className="flex items-center w-full px-2 py-1.5 text-sm cursor-pointer">
            <Checkbox
              id="ignored-filter"
              checked={draftFilters.ignored?.includes(true) || false}
              onCheckedChange={(checked) => handleCheckboxChange('ignored', true as unknown as number, !!checked)}
              className="mr-2"
            />
            <span className="flex-grow" onClick={() => handleLabelClick('ignored', true as unknown as number)}>
              {t("Ignored")}
            </span>
          </label>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Uncategorized — hoisted out of the drilldown for one-click access */}
        {categories.find(c => c.id === 0) && (
          renderDropdownItem('categories', categories.find(c => c.id === 0)!)
        )}

        {/* Categories Section */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={isCategoriesFilterActive ? 'text-blue-500' : ''}>
            {isCategoriesFilterActive && <span className="h-2 w-2 bg-blue-500 rounded-full mr-2"></span>}
            {t("Categories")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <ScrollArea style={{ height: '300px' }}>
              {[...categoryGroups].sort((a, b) => {
                if (a.id <= 0 && b.id > 0) return 1;
                if (b.id <= 0 && a.id > 0) return -1;
                return a.name.localeCompare(b.name);
              }).map((group, index) => (
                <React.Fragment key={group.id}>
                  {index > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="font-semibold text-sm text-muted-foreground px-2">
                    {group.name}
                  </DropdownMenuLabel>
                  {categories
                    .filter(c => c.group_id === group.id && c.id !== 0)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(category => renderDropdownItem('categories', category, 'ml-4'))}
                </React.Fragment>
              ))}
            </ScrollArea>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Tags Section */}
        {(tags as Tag[]).length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={isTagsFilterActive ? 'text-blue-500' : ''}>
              {isTagsFilterActive && <span className="h-2 w-2 bg-blue-500 rounded-full mr-2"></span>}
              {t("Tags")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <ScrollArea style={{ height: '200px' }}>
                {[...(tags as Tag[])].sort((a, b) => a.name.localeCompare(b.name)).map(tag => (
                  <DropdownMenuItem key={tag.id} onSelect={(e) => e.preventDefault()} className="p-0">
                    <label className="flex items-center w-full px-2 py-1.5 text-sm cursor-pointer">
                      <Checkbox
                        id={`tag-${tag.id}`}
                        checked={draftFilters.tags?.includes(tag.id) || false}
                        onCheckedChange={(checked) => handleCheckboxChange('tags', tag.id, !!checked)}
                        className="mr-2"
                      />
                      <span
                        className="flex items-center gap-2 flex-grow"
                        onClick={() => handleLabelClick('tags', tag.id)}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </span>
                    </label>
                  </DropdownMenuItem>
                ))}
              </ScrollArea>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* Accounts Section */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={isAccountsFilterActive ? 'text-blue-500' : ''}>
            {isAccountsFilterActive && <span className="h-2 w-2 bg-blue-500 rounded-full mr-2"></span>}
            {t("Accounts")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <ScrollArea style={{ height: '200px' }}>
              {accounts.sort((a, b) => a.name.localeCompare(b.name)).map(account => renderDropdownItem('accounts', account))}
            </ScrollArea>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <div className="p-2 flex justify-between">
          <Button variant="ghost" onClick={handleClear}>{t("Clear All")}</Button>
          <Button onClick={handleApply}>{t("Apply")}</Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TransactionFilter;
