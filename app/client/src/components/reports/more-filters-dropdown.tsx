import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronDownIcon, FilterIcon, CheckIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useFinance } from '@/contexts/finance-context';
import { cn } from '@/lib/utils';

interface MoreFiltersDropdownProps {
  accountIds: string[];
  categoryIds: string[];
  groupIds: string[];
  onAccountChange: (accountIds: string[]) => void;
  onCategoryChange: (categoryIds: string[]) => void;
  onGroupChange: (groupIds: string[]) => void;
}

const MoreFiltersDropdown: React.FC<MoreFiltersDropdownProps> = ({
  accountIds,
  categoryIds,
  groupIds,
  onAccountChange,
  onCategoryChange,
  onGroupChange
}) => {
  const { t } = useTranslation();
  const { accounts = [], categories = [], categoryGroups = [] } = useFinance();
  const [open, setOpen] = React.useState(false);
  const [groupOpen, setGroupOpen] = React.useState(false);
  const [categoryOpen, setCategoryOpen] = React.useState(false);
  
  // Filter out income categories for expense reports
  const expenseCategories = categories.filter(cat => !cat.category_groups?.is_income);
  
  // Check if any non-default filters are active
  const hasActiveFilters = !accountIds.includes('all') || !categoryIds.includes('all') || !groupIds.includes('all');
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          className="h-9 px-3"
        >
          <FilterIcon className="mr-2 h-4 w-4" />
          {t('More Filters')}
          {hasActiveFilters && (
            <span className="ml-1 h-2 w-2 bg-blue-500 rounded-full"></span>
          )}
          <ChevronDownIcon className="ml-2 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">         
          {/* Account Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">{t('Account')}</Label>
            <Select value={accountIds[0]} onValueChange={(value) => onAccountChange([value])}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder={t('All Accounts')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('All Accounts')}</SelectItem>
                {accounts && accounts.sort((a, b) => a.name.localeCompare(b.name)).map(account => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    <div className="flex items-center">
                      <span className="mr-2">{account.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Group Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">{t('Category Group')}</Label>
            <Popover open={groupOpen} onOpenChange={setGroupOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={groupOpen}
                  className="h-8 w-full justify-between text-sm"
                >
                  {groupIds[0] === 'all'
                    ? t('All Groups')
                    : categoryGroups.find(g => g.id.toString() === groupIds[0])?.name || t('All Groups')
                  }
                  <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder={t('Search groups...')} className="h-8" />
                  <CommandList>
                    <CommandEmpty>{t('No groups found.')}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          onGroupChange(['all']);
                          setGroupOpen(false);
                        }}
                      >
                        <CheckIcon
                          className={cn(
                            "mr-2 h-4 w-4",
                            groupIds[0] === 'all' ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {t('All Groups')}
                      </CommandItem>
                      {categoryGroups && categoryGroups.map(group => (
                        <CommandItem
                          key={group.id}
                          value={group.name}
                          onSelect={() => {
                            onGroupChange([group.id.toString()]);
                            setGroupOpen(false);
                          }}
                        >
                          <CheckIcon
                            className={cn(
                              "mr-2 h-4 w-4",
                              groupIds[0] === group.id.toString() ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="mr-2">{group.emoji}</span>
                          {group.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Category Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">{t('Category')}</Label>
            <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={categoryOpen}
                  className="h-8 w-full justify-between text-sm"
                >
                  {categoryIds[0] === 'all'
                    ? t('All Categories')
                    : expenseCategories.find(c => c.id.toString() === categoryIds[0])?.name || t('All Categories')
                  }
                  <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder={t('Search categories...')} className="h-8" />
                  <CommandList>
                    <CommandEmpty>{t('No categories found.')}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          onCategoryChange(['all']);
                          setCategoryOpen(false);
                        }}
                      >
                        <CheckIcon
                          className={cn(
                            "mr-2 h-4 w-4",
                            categoryIds[0] === 'all' ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {t('All Categories')}
                      </CommandItem>
                      {expenseCategories
                        .filter(cat => groupIds[0] === 'all' || cat.group_id.toString() === groupIds[0])
                        .map(category => (
                          <CommandItem
                            key={category.id}
                            value={category.name}
                            onSelect={() => {
                              onCategoryChange([category.id.toString()]);
                              setCategoryOpen(false);
                            }}
                          >
                            <CheckIcon
                              className={cn(
                                "mr-2 h-4 w-4",
                                categoryIds[0] === category.id.toString() ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {category.name}
                          </CommandItem>
                        ))
                      }
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {hasActiveFilters && (
            <div className="pt-2 border-t">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  onAccountChange(['all']);
                  onCategoryChange(['all']);
                  onGroupChange(['all']);
                }}
                className="h-7 px-2 text-xs"
              >
                {t('Clear all filters')}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MoreFiltersDropdown;