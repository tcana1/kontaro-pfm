import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useFinance } from '@/contexts/finance-context';
import { 
  Popover,
  PopoverTrigger,
  PopoverContent
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CurrencyCode, getCurrencyOptions } from '@/lib/currency-formatter';

const LocaleSelector: React.FC = () => {
  const { currency, locale, setCurrency } = useFinance();
  const [isOpen, setIsOpen] = useState(false);

  const currencyOptions = getCurrencyOptions(locale);
  
  const handleSelectCurrency = (newCurrency: CurrencyCode) => {
    setCurrency(newCurrency);
    setIsOpen(false);
  };
  
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          className="flex items-center px-3 py-1.5 h-auto text-sm"
        >
          <span className="mr-1">{currency}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0">
        <div className="max-h-64 overflow-y-auto py-1">
          {currencyOptions.map(option => (
            <div
              key={option.value}
              className="px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              onClick={() => handleSelectCurrency(option.value)}
            >
              {option.label}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default LocaleSelector;
