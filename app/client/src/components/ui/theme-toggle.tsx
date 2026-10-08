import React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useFinance } from '@/contexts/finance-context';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const CYCLE: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
const LABELS = { light: 'Light', dark: 'Dark', system: 'System' };

const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useFinance();

  const handleClick = () => {
    const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];
    setTheme(next);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClick}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
          >
            {theme === 'dark'    && <Moon    className="h-5 w-5" />}
            {theme === 'light'   && <Sun     className="h-5 w-5" />}
            {theme === 'system'  && <Monitor className="h-5 w-5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{LABELS[theme]} — click to cycle</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ThemeToggle;
