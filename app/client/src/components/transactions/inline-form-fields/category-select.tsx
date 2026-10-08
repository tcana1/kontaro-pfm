import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Command as CommandPrimitive } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFinance } from '@/contexts/finance-context';
import type { Category, CategoryWithGroup } from '@shared/schema';
import { Separator } from '@/components/ui/separator';

// Define a type that includes CSS background-color property type
type BackgroundColor = string | null | undefined;

// Ensure Category type has color as BackgroundColor
type ExtendedCategory = CategoryWithGroup & { color: BackgroundColor; displayName?: string };

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  isTransfer?: boolean; // Added to handle transfer specific logic if needed
  disabled?: boolean; // Add disabled prop
  title?: string;
  size?: "sm" | "default"; // Size variant
  openOnFocus?: boolean; // Auto-open on focus
  onSelectionComplete?: (trigger: 'enter' | 'tab') => void; // Called after category is selected
  onKeyDown?: (event: React.KeyboardEvent) => boolean;
  registerFieldRef?: (fieldName: string, element: HTMLElement | null) => void;
  fieldName?: string;
  showNoChangeOption?: boolean; // For batch edit modal
}

const CategorySelect: React.FC<CategorySelectProps> = ({
  value,
  onChange,
  onBlur,
  error,
  isTransfer = false,
  disabled = false,
  title,
  size = "sm",
  openOnFocus = false,
  onSelectionComplete,
  onKeyDown,
  registerFieldRef,
  fieldName,
  showNoChangeOption = false,
}) => {
  const { t } = useTranslation();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { categories } = useFinance();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Tracks which key triggered the last selection so onSelectionComplete can route correctly
  const lastSelectionTriggerRef = useRef<'enter' | 'tab'>('enter');
  // Controls which item cmdk highlights. Initialized to the current category on open
  // so the list doesn't highlight the first item (which Tab would commit).
  const [commandValue, setCommandValue] = useState('');
  const [search, setSearch] = useState('');
  // Tracks whether the user actually navigated the list (arrow keys/typing) during this
  // open cycle. cmdk auto-highlights the first item on mount as a race against our own
  // "highlight current category" effect, so Tab must not trust cmdk's highlighted item
  // unless the user actually moved it.
  const userNavigatedRef = useRef(false);

  const formattedCategories = useMemo(() => {
    return categories.map(cat => ({
      ...cat,
      displayName: cat.category_groups ? `${cat.category_groups.name}: ${cat.name}` : cat.name,
    }));
  }, [categories]);

  const incomeCategories = useMemo(() => 
    formattedCategories.filter(cat => cat.category_groups?.is_income),
    [formattedCategories]
  );

  const expenseCategories = useMemo(() => 
    formattedCategories.filter(cat => !cat.category_groups?.is_income && cat.id > 0),
    [formattedCategories]
  );

  const uncategorized = useMemo(() => {
    const found = formattedCategories.find(cat => cat.id === 0);
    return found;
  },
    [formattedCategories]
  );

  type FilteredCategories = {
    income: Record<string, ExtendedCategory[]>;
    expenses: Record<string, ExtendedCategory[]>;
  };

  const groupedCategories = useMemo<FilteredCategories>(() => {
    const filterAndGroup = (cats: ExtendedCategory[]) => {
      return cats.reduce((acc, cat) => {
        const groupName = cat.category_groups?.name || 'No Group';
        if (!acc[groupName]) {
          acc[groupName] = [];
        }
        acc[groupName].push(cat);
        return acc;
      }, {} as Record<string, ExtendedCategory[]>);
    };

    return {
      income: filterAndGroup(incomeCategories),
      expenses: filterAndGroup(expenseCategories)
    };
  }, [incomeCategories, expenseCategories]);

  const normalizeString = (str: string) => {
    return str.normalize("NFD").replace(/\p{M}/gu, "");
  };

  const customCategoryFilter = (value: string, search: string) => {
    const normalizedSearch = normalizeString(search).toLowerCase();
    const parts = value.split(': '); // Split "Group: Category"
    let categoryName = parts[parts.length - 1]; // Last part is always the category name
    let groupName = parts.length > 1 ? parts[0] : ''; // First part is group name if exists

    // Prioritize matching category name
    if (normalizeString(categoryName).toLowerCase().includes(normalizedSearch)) {
      return 1; // Found in category name
    }

    // Then match group name
    if (normalizeString(groupName).toLowerCase().includes(normalizedSearch)) {
      return 0.5; // Found in group name, lower score
    }

    return 0; // No match
  };

  // The "Income/Expense Categories" headings are plain divs, so cmdk can't hide them when a
  // search filters out every item beneath. Mirror its filter to decide whether to show them.
  const hasMatch = (cats: ExtendedCategory[]) =>
    !search || cats.some(cat => customCategoryFilter(cat.displayName ?? cat.name, search) > 0);
  const showIncomeHeading = hasMatch(incomeCategories);
  const showExpenseHeading = hasMatch(expenseCategories);

  // Auto-open when openOnFocus is true
  useEffect(() => {
    if (openOnFocus && !disabled) {
      setPopoverOpen(true);
    }
  }, [openOnFocus, disabled]);

  // Highlight the currently-selected category whenever the dropdown opens (covers
  // user click, Enter, and auto-open — all of which set popoverOpen)
  useEffect(() => {
    if (popoverOpen) {
      const current = formattedCategories.find((cat) => cat.id.toString() === value)?.displayName ?? '';
      setCommandValue(current);
      setSearch('');
      userNavigatedRef.current = false;
    }
  }, [popoverOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-1">
      <Popover open={!disabled && popoverOpen} onOpenChange={(open) => !disabled && setPopoverOpen(open)}>
        <PopoverTrigger asChild>
          <Button
            ref={(el) => {
              (buttonRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
              if (registerFieldRef && fieldName) registerFieldRef(fieldName, el);
            }}
            variant="outline"
            role="combobox"
            id="category-combobox"
            className={cn(
              "w-full justify-between",
              size === "sm" ? "h-7 p-2" : "h-10 px-3 py-2",
              !value && "text-muted-foreground",
              error ? "border-red-500" : "",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onBlur={onBlur}
            title={title}
            onFocus={openOnFocus && !value ? () => setPopoverOpen(true) : undefined}
            onKeyDown={(e) => {
              // Handle keyboard navigation first
              if (onKeyDown) {
                const handled = onKeyDown(e);
                if (handled) return;
              }
              
              // Handle Enter to open dropdown
              if (e.key === 'Enter' && !popoverOpen) {
                e.preventDefault();
                setPopoverOpen(true);
              }
            }}
            disabled={disabled}
          >
            {value === 'no-change' && showNoChangeOption
              ? t('No category change')
              : value
              ? formattedCategories.find((cat) => cat.id.toString() === value)?.displayName
              : t('Select category')}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-full p-0"
          onWheel={(e) => e.stopPropagation()}
        >
          <Command filter={customCategoryFilter} value={commandValue} onValueChange={setCommandValue}>
            <CommandInput
              placeholder={t('Search category...')}
              onValueChange={(query) => {
                setSearch(query);
                // Typing a search query counts as navigation/intent to change the value.
                userNavigatedRef.current = true;
              }}
              onKeyDown={(e) => {
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && popoverOpen) {
                  userNavigatedRef.current = true;
                  return;
                }
                if (e.key === 'Tab' && popoverOpen) {
                  e.preventDefault();
                  if (e.shiftKey) {
                    // Shift+Tab: go back without committing
                    setPopoverOpen(false);
                    onKeyDown?.(e);
                    return;
                  }
                  // If the user never navigated the list, tabbing through must not touch
                  // the value at all — cmdk may highlight the first item on mount as a race
                  // against our own "highlight current category" effect, and that highlight
                  // is not a real user selection.
                  if (!userNavigatedRef.current) {
                    setPopoverOpen(false);
                    onSelectionComplete?.('tab');
                    return;
                  }
                  // Tab after real navigation: commit the highlighted category and advance.
                  lastSelectionTriggerRef.current = 'tab';
                  const list = e.currentTarget.closest('[cmdk-root]');
                  const highlighted = list?.querySelector('[cmdk-item][data-selected="true"]') as HTMLElement | null;
                  if (highlighted) {
                    highlighted.click();
                  } else {
                    setPopoverOpen(false);
                    onSelectionComplete?.('tab');
                    lastSelectionTriggerRef.current = 'enter';
                  }
                }
              }}
            />
            <CommandList 
              onWheel={(e) => {
                e.stopPropagation();
                const target = e.currentTarget;
                target.scrollTop += e.deltaY;
              }}
            >
              <CommandEmpty>
                {t('No categories found.')}
              </CommandEmpty>
              {showNoChangeOption && (
                <>
                  <CommandGroup>
                    <CommandItem
                      key="no-change"
                      value={t('No category change')}
                      onSelect={() => {
                        onChange('no-change');
                        setPopoverOpen(false);
                        const trigger = lastSelectionTriggerRef.current;
                        lastSelectionTriggerRef.current = 'enter';
                        onSelectionComplete?.(trigger);
                      }}
                      className="text-sm font-medium"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === 'no-change' ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {t('No category change')}
                    </CommandItem>
                  </CommandGroup>
                  <Separator className="my-2" />
                </>
              )}
              {showIncomeHeading && (
                <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                  {t('Income Categories')}
                </div>
              )}
              {Object.entries(groupedCategories.income).map(([groupName, categoriesInGroup]) => (
                <CommandGroup key={groupName} heading={groupName === 'No Group' ? undefined : groupName}>
                  {categoriesInGroup.map((category: ExtendedCategory) => (
                    <CommandItem
                      key={category.id}
                      value={category.displayName}
                      onSelect={() => {
                        onChange(category.id.toString());
                        setPopoverOpen(false);
                        const trigger = lastSelectionTriggerRef.current;
                        lastSelectionTriggerRef.current = 'enter';
                        onSelectionComplete?.(trigger);
                      }}
                      className="text-sm"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === category.id.toString() ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {category.displayName}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {showExpenseHeading && (
                <>
                  {showIncomeHeading && <Separator className="my-2" />}
                  <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                    {t('Expense Categories')}
                  </div>
                </>
              )}
              {Object.entries(groupedCategories.expenses).map(([groupName, categoriesInGroup]) => (
                <CommandGroup key={groupName} heading={groupName === 'No Group' ? undefined : groupName}>
                  {categoriesInGroup.map((category: ExtendedCategory) => (
                    <CommandItem
                      key={category.id}
                      value={category.displayName}
                      onSelect={() => {
                        onChange(category.id.toString());
                        setPopoverOpen(false);
                        const trigger = lastSelectionTriggerRef.current;
                        lastSelectionTriggerRef.current = 'enter';
                        onSelectionComplete?.(trigger);
                      }}
                      className="text-sm"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === category.id.toString() ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {category.displayName}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {uncategorized && (
                <>
                  <Separator className="my-2" />
                  <CommandGroup heading="Other">
                    <CommandItem
                      key={uncategorized.id}
                      value={uncategorized.displayName}
                      onSelect={() => {
                        onChange(uncategorized.id.toString());
                        setPopoverOpen(false);
                        const trigger = lastSelectionTriggerRef.current;
                        lastSelectionTriggerRef.current = 'enter';
                        onSelectionComplete?.(trigger);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === uncategorized.id.toString() ? "opacity-100" : "opacity-0"
                        )}
                      />
                      
                      {uncategorized.displayName}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
};
export default CategorySelect;
