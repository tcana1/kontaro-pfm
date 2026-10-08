import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronDownIcon, CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MultiSelectOption {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  placeholder: string;
  allLabel: string;
  searchPlaceholder?: string;
  className?: string;
  width?: string;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  selectedIds,
  onChange,
  placeholder,
  allLabel,
  searchPlaceholder = "Search...",
  className = "",
  width = "min-w-40 max-w-[16rem]"
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  
  const isAllSelected = selectedIds.includes('all');
  const selectedCount = isAllSelected ? options.length : selectedIds.length;
  
  const getDisplayText = () => {
    if (isAllSelected || selectedIds.length === 0) {
      return allLabel;
    }
    if (selectedIds.length === 1) {
      const option = options.find(opt => opt.id === selectedIds[0]);
      return option?.name || placeholder;
    }
    return t("{{count}} selected", { count: selectedIds.length });
  };

  const handleSelectAll = () => {
    onChange(['all']);
  };

  const handleDeselectAll = () => {
    onChange([]);
  };

  const handleOptionToggle = (optionId: string) => {
    if (optionId === 'all') {
      onChange(['all']);
      return;
    }

    let newSelection: string[];
    
    if (isAllSelected) {
      // If "all" was selected, deselect just this one item (keep all others)
      newSelection = options
        .filter(opt => opt.id !== optionId)
        .map(opt => opt.id);
    } else {
      if (selectedIds.includes(optionId)) {
        // Remove the option (checkbox behavior)
        newSelection = selectedIds.filter(id => id !== optionId);
      } else {
        // Add the option (checkbox behavior)
        newSelection = [...selectedIds.filter(id => id !== 'all'), optionId];
      }
      
      // If all options are now selected, switch to "all"
      if (newSelection.length === options.length) {
        newSelection = ['all'];
      }
    }
    
    onChange(newSelection);
  };

  const isOptionSelected = (optionId: string) => {
    return isAllSelected || selectedIds.includes(optionId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 justify-between text-sm", width, className)}
        >
          <span className="truncate">{getDisplayText()}</span>
          <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-8" />
          <CommandList>
            <CommandEmpty>{t("No options found.")}</CommandEmpty>
            <CommandGroup>
              {/* Select All / Deselect All Controls */}
              <div className="p-2 border-b">
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="h-6 px-2 text-xs"
                  >
                    {t("Select All")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                    className="h-6 px-2 text-xs"
                  >
                    {t("Deselect All")}
                  </Button>
                </div>
              </div>
              
              {/* All Option */}
              <CommandItem
                value="all"
                onSelect={() => handleOptionToggle('all')}
              >
                <CheckIcon
                  className={cn(
                    "mr-2 h-4 w-4",
                    isAllSelected ? "opacity-100" : "opacity-0"
                  )}
                />
                {allLabel}
              </CommandItem>
              
              {/* Individual Options */}
              {options.map((option, index) => {
                const isUncategorized = option.id === '0';
                const showSeparator = isUncategorized && options.some(opt => opt.id !== '0');
                
                return (
                  <React.Fragment key={option.id}>
                    {showSeparator && (
                      <div className="border-t border-gray-200 dark:border-gray-700 mx-2 my-1" />
                    )}
                    <CommandItem
                      value={option.name}
                      onSelect={() => handleOptionToggle(option.id)}
                    >
                      <CheckIcon
                        className={cn(
                          "mr-2 h-4 w-4",
                          isOptionSelected(option.id) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {option.emoji && <span className="mr-2">{option.emoji}</span>}
                      {option.name}
                    </CommandItem>
                  </React.Fragment>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelect;