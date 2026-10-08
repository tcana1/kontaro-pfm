import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  parseDateInput,
  toISODateString,
  formatDateForLocaleInput,
  getLocalePlaceholder,
  type DateParseResult
} from '@/lib/date-utils';
import { useFinance } from '@/contexts/finance-context';

interface HybridDateInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  autoFocus?: boolean;
  title?: string;
  placeholder?: string;
  onKeyDown?: (event: React.KeyboardEvent) => boolean;
  onAdvance?: () => void;
  registerFieldRef?: (fieldName: string, element: HTMLElement | null) => void;
  fieldName?: string;
}

const HybridDateInput: React.FC<HybridDateInputProps> = ({
  value,
  onChange,
  onBlur,
  error,
  disabled = false,
  size = "sm",
  autoFocus = false,
  title,
  placeholder: placeholderProp,
  onKeyDown,
  onAdvance,
  registerFieldRef,
  fieldName,
}) => {
  const { t } = useTranslation();
  const { locale, dateFormat } = useFinance();
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState<Date | undefined>();
  const [userNavigatedMonth, setUserNavigatedMonth] = useState<Date | undefined>();
  const [justSelectedDate, setJustSelectedDate] = useState(false);
  const [hasAutoFocused, setHasAutoFocused] = useState(false);
  const [openedViaAutoFocus, setOpenedViaAutoFocus] = useState(false);
  const [parseResult, setParseResult] = useState<DateParseResult>({
    isValid: false,
    date: null,
    formatted: '',
    partial: false
  });
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Initialize input value from prop
  useEffect(() => {
    if (value) {
      try {
        // Convert ISO date to locale format for display
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        const formatted = formatDateForLocaleInput(date, locale, dateFormat);
        setInputValue(formatted);
        // Initialize display month to the selected date's month
        if (!displayMonth) {
          setDisplayMonth(date);
        }
      } catch (e) {
        setInputValue(value);
      }
    } else {
      setInputValue('');
      // If no value, default to current month
      if (!displayMonth) {
        setDisplayMonth(new Date());
      }
    }
  }, [value, locale, dateFormat, displayMonth]);

  // Debounced parsing function
  const debouncedParse = useCallback((input: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      const result = parseDateInput(input, locale, dateFormat);
      setParseResult(result);
      
      // If we have a valid complete date from typing, update the parent and calendar month
      if (result.isValid && !result.partial && result.date) {
        const isoDate = toISODateString(result.date);
        if (isoDate !== value) {
          onChange(isoDate);
        }
        // When user types a valid date, move calendar to that month (reset user navigation)
        setDisplayMonth(result.date);
        setUserNavigatedMonth(undefined);
      }
    }, 300);
  }, [locale, dateFormat, onChange, value]);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    debouncedParse(newValue);
  };

  // Handle calendar selection
  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      const isoDate = toISODateString(date);
      const formatted = formatDateForLocaleInput(date, locale, dateFormat);
      
      setInputValue(formatted);
      onChange(isoDate);
      setIsOpen(false);
      
      // Set flag to prevent immediate reopening
      setJustSelectedDate(true);
      
      // Keep focus on input for continued typing, but don't reopen calendar
      setTimeout(() => {
        inputRef.current?.focus();
        // Reset the flag after focus is set
        setTimeout(() => {
          setJustSelectedDate(false);
        }, 100);
      }, 0);
    }
  };

  // Handle calendar month navigation (when user clicks arrows)
  const handleMonthChange = (month: Date) => {
    setUserNavigatedMonth(month);
    setDisplayMonth(month);
  };

  // Handle focus
  const handleFocus = () => {
    // Don't open if we just selected a date
    if (justSelectedDate) {
      return;
    }
    
    // When opening, if there's a selected date, show that month
    const selectedDate = getSelectedDate();
    if (selectedDate && !userNavigatedMonth) {
      setDisplayMonth(selectedDate);
    }
    
    setIsOpen(true);
    setOpenedViaAutoFocus(false); // Manual focus/click, not auto-focus
  };

  // Handle click on input (for when input already has focus)
  const handleInputClick = () => {
    // Don't open if we just selected a date
    if (justSelectedDate) {
      return;
    }
    if (!isOpen) {
      // When opening, if there's a selected date, show that month
      const selectedDate = getSelectedDate();
      if (selectedDate && !userNavigatedMonth) {
        setDisplayMonth(selectedDate);
      }
      
      setIsOpen(true);
      setOpenedViaAutoFocus(false); // Manual click, not auto-focus
    }
  };

  // Auto-focus and open calendar when autoFocus is true (only once on mount)
  useEffect(() => {
    if (autoFocus && !disabled && !hasAutoFocused && inputRef.current) {
      inputRef.current.focus();
      setIsOpen(true);
      setOpenedViaAutoFocus(true); // Track that this was opened via auto-focus
      setHasAutoFocused(true);
    }
  }, [autoFocus, disabled, hasAutoFocused]);

  // Restore focus to input when calendar opens via auto-focus
  useEffect(() => {
    if (isOpen && openedViaAutoFocus && inputRef.current) {
      // Use setTimeout to ensure calendar has rendered first
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
  }, [isOpen, openedViaAutoFocus]);

  // Handle blur
  const handleBlur = (e: React.FocusEvent) => {
    // Don't close if clicking on calendar or its navigation buttons
    if (containerRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    
    // Add a small delay to allow calendar navigation clicks to register
    setTimeout(() => {
      // Check if focus moved to something within the calendar container
      if (!containerRef.current?.contains(document.activeElement as Node)) {
        setIsOpen(false);
        onBlur?.();
      }
    }, 100);
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Let parent handle navigation first
    if (onKeyDown) {
      const handled = onKeyDown(e);
      if (handled) return;
    }

    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Enter') {
      if (parseResult.isValid && parseResult.date) {
        const isoDate = toISODateString(parseResult.date);
        onChange(isoDate);
        setIsOpen(false);
        // Advance to next field after successful date entry
        if (onAdvance) {
          onAdvance();
        }
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      // Tab should close calendar and advance to next field
      e.preventDefault();
      setIsOpen(false);
      if (onAdvance) {
        onAdvance();
      }
    }
  };


  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (containerRef.current && !containerRef.current.contains(target)) {
        // Don't close immediately if clicking on calendar navigation buttons
        const isCalendarButton = (target as Element)?.closest?.('[role="button"]') || 
                                 (target as Element)?.closest?.('button') ||
                                 (target as Element)?.tagName === 'BUTTON';
        
        if (isCalendarButton) {
          // Give the button click a chance to register before potentially closing
          setTimeout(() => {
            if (containerRef.current && !containerRef.current.contains(document.activeElement as Node)) {
              setIsOpen(false);
            }
          }, 50);
        } else {
          setIsOpen(false);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Get input styling based on parse state
  const getInputStyling = () => {
    if (error) return 'border-red-500';
    if (!inputValue) return '';
    if (parseResult.partial) return 'border-yellow-400';
    if (parseResult.isValid) return 'border-green-500';
    if (parseResult.error) return 'border-red-400';
    return '';
  };

  // Get the month to display in calendar
  const getDisplayMonth = () => {
    // 1. If user has navigated to a specific month, use that
    if (userNavigatedMonth) {
      return userNavigatedMonth;
    }
    // 2. If we have a display month set, use that
    if (displayMonth) {
      return displayMonth;
    }
    // 3. If we have a valid parsed date, use its month
    if (parseResult.isValid && parseResult.date) {
      return parseResult.date;
    }
    // 4. If we have a prop value, use its month
    if (value) {
      try {
        const [year, month, day] = value.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      } catch (e) {
        // ignore
      }
    }
    // 5. Default to current month
    return new Date();
  };

  // Get selected date for calendar
  const getSelectedDate = () => {
    // Always prioritize the actual input value first
    if (value) {
      try {
        const [year, month, day] = value.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      } catch (e) {
        // ignore
      }
    }
    
    // Fall back to the parsed date from current input if valid
    if (parseResult.isValid && parseResult.date) {
      return parseResult.date;
    }
    
    return undefined;
  };

  const placeholder = placeholderProp ?? getLocalePlaceholder(locale, dateFormat);

  return (
    <div className="space-y-1">
      <div className="relative" ref={containerRef}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onClick={handleInputClick}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          title={title}
          className={cn(
            size === "default"
              ? "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              : "w-full text-left font-normal flex h-7 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500",
            !inputValue && size !== "default" && "text-muted-foreground",
            getInputStyling(),
            size !== "default" && disabled && "opacity-50 cursor-not-allowed"
          )}
          aria-describedby={error ? "date-error" : undefined}
          aria-invalid={error ? "true" : "false"}
        />

        {/* Calendar dropdown */}
        {isOpen && !disabled && (
          <div className="absolute top-full left-0 z-50 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
            <Calendar
              mode="single"
              selected={getSelectedDate()}
              onSelect={handleCalendarSelect}
              month={getDisplayMonth()}
              onMonthChange={handleMonthChange}
              initialFocus={!openedViaAutoFocus} // Only auto-focus calendar if NOT opened via keyboard auto-focus
              className="rounded-md border-0"
            />
          </div>
        )}
      </div>
      
      {/* Error message */}
      {error && (
        <p id="date-error" className="text-red-500 text-xs">
          {error}
        </p>
      )}
      
      {/* Parse error message */}
      {!error && parseResult.error && inputValue && !parseResult.partial && (
        <p className="text-red-400 text-xs">
          {parseResult.error}
        </p>
      )}
      
      {/* Format hint for partial input */}
      {!error && !parseResult.error && parseResult.partial && (
        <p className="text-yellow-600 dark:text-yellow-400 text-xs">
          {t("Continue typing or press Enter to accept")}
        </p>
      )}
    </div>
  );
};

export default HybridDateInput;