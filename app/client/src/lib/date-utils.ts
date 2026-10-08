/**
 * Date formatting utilities for consistent date handling across the application
 * 
 * These utilities handle the conversion between different date formats:
 * 1. ISO 8601 dates (YYYY-MM-DD) - used for backend/API/DB communication
 * 2. Localized date strings - used for UI display based on user preferences
 * 
 * IMPLEMENTATION NOTE: This file has been refactored to avoid using Date objects
 * for simple string formatting, preventing timezone-related issues.
 */

/**
 * Splits a date string into its component parts based on common separators
 * Returns [year, month, day] with numeric values 
 * Note: month value is 1-12 (human month), not 0-11 (JS Date month)
 */
function extractDateParts(dateString: string): [number, number, number] | null {
  // Don't try to parse empty strings
  if (!dateString || dateString.trim() === '') {
    return null;
  }

  // Handle ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    return [year, month, day];
  }

  // Extract date parts using various separators
  // This handles various formats like MM/DD/YYYY, DD/MM/YYYY, etc.
  const parts = dateString.split(/[-/.]/);
  if (parts.length !== 3) {
    return null;
  }

  // Determine the format based on the parts
  let year: number, month: number, day: number;

  // Check if first part is a 4-digit year (YYYY-MM-DD)
  if (parts[0].length === 4) {
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } 
  // Check if last part is a 4-digit year (MM/DD/YYYY or DD/MM/YYYY)
  else if (parts[2].length === 4) {
    year = parseInt(parts[2], 10);
    // We can't be sure if it's MM/DD or DD/MM format here
    // This will be handled by the userFormat parameter in parsing functions
    month = parseInt(parts[0], 10);
    day = parseInt(parts[1], 10);
  }
  // Fallback
  else {
    return null;
  }

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }

  return [year, month, day];
}

/**
 * Converts a date to ISO 8601 date string (YYYY-MM-DD)
 * This function now handles string inputs directly without converting to Date objects
 * when possible, avoiding timezone issues.
 */
export function toISODateString(date: Date | string): string {
  try {
    // If it's already a string in YYYY-MM-DD format, return it
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    
    // If it's a string, try to extract date parts directly
    if (typeof date === 'string') {
      const parts = extractDateParts(date);
      if (parts) {
        const [year, month, day] = parts;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    
    // If it's a Date object or string that couldn't be parsed directly
    // Use UTC methods to avoid timezone offset issues
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (!dateObj || isNaN(dateObj.getTime())) {
      console.error("Invalid date in toISODateString:", date);
      // Return today's date as fallback in YYYY-MM-DD format
      const today = new Date();
      return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    }
    
    return `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
  } catch (e) {
    console.error("Error formatting date:", e);
    // Return today's date as fallback in YYYY-MM-DD format
    const today = new Date();
    return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  }
}

/**
 * Gets localized month names for a given locale
 * Uses Intl.DateTimeFormat with UTC dates to avoid timezone issues
 */
function getLocalizedMonthNames(locale: string, style: 'short' | 'long' = 'short'): string[] {
  return Array.from({length: 12}, (_, i) => {
    return new Intl.DateTimeFormat(locale, { 
      month: style,
      timeZone: 'UTC' // Use UTC to prevent timezone shifts
    }).format(new Date(Date.UTC(2000, i, 1)));
  });
}

/**
 * Format a date string (YYYY-MM-DD) for display based on user's locale and format preferences
 * This version avoids unnecessary Date object creation for simple formatting
 * 
 * Custom formats:
 * - 'DD/MM/YYYY': Day/Month/Year (25/12/2023)
 * - 'MM/DD/YYYY': Month/Day/Year (12/25/2023)
 * - 'YYYY/MM/DD': Year/Month/Day (2023/12/25)
 * - 'DD/MMM/YYYY': Day/Month abbreviation/Year (25/Dec/2023)
 * - 'DD-MM-YYYY': Day-Month-Year (25-12-2023)
 * - 'MM-DD-YYYY': Month-Day-Year (12-25-2023)
 * - 'YYYY-MM-DD': Year-Month-Day (2023-12-25)
 * - 'DD-MMM-YYYY': Day-Month abbreviation-Year (25-Dec-2023)
 * - 'MMM DD, YYYY': Month abbreviation Day, Year (Dec 25, 2023)
 */
export function formatDateForDisplay(
  date: Date | string, 
  locale: string = 'en-US', 
  format: string = 'default'
): string {
  try {
    // Handle empty or invalid input
    if (!date) {
      return '';
    }

    // Convert to ISO format first if it's a Date object
    const isoDate = typeof date === 'string' ? date : toISODateString(date);
    
    // Validate the ISO format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      return 'Invalid date';
    }
    
    // Extract parts from the ISO date
    const [year, month, day] = isoDate.split('-').map(Number);
    
    // For system/preset formats
    if (format === 'default' || format === 'MM/DD/YYYY') {
      format = 'MM/DD/YYYY';
    }
    
    // Handle all possible format patterns
    switch (format) {
      case 'iso':
      case 'YYYY-MM-DD':
        return isoDate;
        
      case 'short':
      case 'MM/DD/YYYY':
        return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
        
      case 'DD/MM/YYYY':
        return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
        
      case 'YYYY/MM/DD':
        return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
        
      case 'DD-MM-YYYY':
        return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
        
      case 'MM-DD-YYYY':
        return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}-${year}`;
        
      case 'DD/MMM/YYYY':
      case 'DD-MMM-YYYY': {
        // Get localized month names
        const monthNames = getLocalizedMonthNames(locale);
        const separator = format === 'DD/MMM/YYYY' ? '/' : '-';
        return `${String(day).padStart(2, '0')}${separator}${monthNames[month-1]}${separator}${year}`;
      }
        
      case 'MMM DD, YYYY':
      case 'long': {
        // Get localized month names for the long format
        const monthNames = getLocalizedMonthNames(locale, 'long');
        return `${monthNames[month-1]} ${day}, ${year}`;
      }
        
      default:
        // Fallback to MM/DD/YYYY
        return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    }
  } catch (e) {
    console.error("Error formatting date for display:", e);
    return 'Error formatting date';
  }
}

/**
 * Parses a user input date string into ISO format (YYYY-MM-DD)
 * Handles various input formats based on user's preferred format
 */
export function parseDateForDatabase(
  userDateString: string, 
  userFormat: string = 'MM/DD/YYYY',
  locale: string = 'en-US'
): string | null {
  try {
    if (!userDateString || userDateString.trim() === '') {
      return null;
    }
    
    // If it's already in ISO format, return it
    if (/^\d{4}-\d{2}-\d{2}$/.test(userDateString)) {
      return userDateString;
    }
    
    // Handle default format
    if (userFormat === 'default') {
      userFormat = 'MM/DD/YYYY';
    }
    
    // Split the input string using common separators
    const parts = userDateString.split(/[-/.]/);
    if (parts.length !== 3) {
      return null;
    }
    
    // Initialize with default values to avoid TypeScript errors
    let year = 0, month = 0, day = 0;
    
    // Parse based on the user's format
    if (userFormat.startsWith('DD')) {
      // DD/MM/YYYY or DD-MM-YYYY
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    } else if (userFormat.startsWith('MM')) {
      // MM/DD/YYYY or MM-DD-YYYY
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    } else if (userFormat.startsWith('YYYY')) {
      // YYYY/MM/DD or YYYY-MM-DD
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else {
      // Handle formats with month names (DD/MMM/YYYY or MMM DD, YYYY)
      if (userFormat.includes('MMM')) {
        const monthNames = getLocalizedMonthNames(locale);
        
        // For DD/MMM/YYYY or DD-MMM-YYYY
        if (userFormat.startsWith('DD')) {
          day = parseInt(parts[0], 10);
          // Find the month index from the name
          const monthName = parts[1].toLowerCase();
          month = monthNames.findIndex(m => m.toLowerCase() === monthName) + 1;
          year = parseInt(parts[2], 10);
        } 
        // For MMM DD, YYYY
        else if (userFormat.startsWith('MMM')) {
          // Special handling for this format which might use commas
          const match = userDateString.match(/([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})/);
          if (match) {
            const monthName = match[1].toLowerCase();
            month = monthNames.findIndex(m => m.toLowerCase() === monthName) + 1;
            day = parseInt(match[2], 10);
            year = parseInt(match[3], 10);
          } else {
            return null;
          }
        }
      } else {
        return null;
      }
    }
    
    // Validate the parsed values
    if (isNaN(year) || isNaN(month) || isNaN(day) || 
        year < 1000 || year > 9999 || 
        month < 1 || month > 12 || 
        day < 1 || day > 31) {
      return null;
    }
    
    // Return in ISO format
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } catch (e) {
    console.error("Error parsing date:", e);
    return null;
  }
}

/**
 * Legacy compatibility function for code that expects Date objects
 * This should only be used when absolutely necessary for library APIs that require Date objects
 */
export function parseDate(dateString: string, userFormat: string = 'MM/DD/YYYY'): Date | null {
  const isoDate = parseDateForDatabase(dateString, userFormat);
  if (!isoDate) {
    return null;
  }
  
  // Create a Date in UTC to avoid timezone issues
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Format a local Date object to YYYY-MM-DD using the device's local timezone.
 * Use this for dates from date pickers or user input. Never use toISOString()
 * for these — it converts to UTC first, which shifts the date for UTC-offset locales.
 */
export function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Parse a YYYY-MM-DD string into a Date at local midnight — the inverse of
 * localDateString(). `new Date('2026-03-01')` is not equivalent: the date-only ISO
 * form is specified to parse as UTC, so it lands on the previous day for every
 * negative UTC offset.
 */
export function localDateFromString(dateString: string): Date | null {
  if (!isValidISODate(dateString)) {
    return null;
  }

  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get today's date in ISO format (YYYY-MM-DD) using local timezone.
 */
export function getTodayISO(): string {
  return localDateString(new Date());
}

/**
 * Validates if a string is a properly formatted ISO date (YYYY-MM-DD)
 */
export function isValidISODate(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }
  
  const [year, month, day] = dateString.split('-').map(Number);
  
  // Check if date values are valid
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  
  // Check days in month (including leap years)
  const daysInMonth = [31, (isLeapYear(year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

/**
 * Helper function to check if a year is a leap year
 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

// ===== HYBRID DATE INPUT UTILITIES =====

/**
 * Result of parsing a date input string
 */
export interface DateParseResult {
  isValid: boolean;
  date: Date | null;
  formatted: string;
  partial: boolean;
  error?: string;
}

/**
 * Parse user input into a date, handling partial input and various formats
 * This is designed for real-time parsing as the user types
 */
export function parseDateInput(
  input: string,
  locale: string = 'en-US',
  dateFormat: string = 'MM/DD/YYYY'
): DateParseResult {
  // Handle empty input
  if (!input || input.trim() === '') {
    return {
      isValid: false,
      date: null,
      formatted: '',
      partial: false
    };
  }

  const trimmedInput = input.trim();
  
  // Handle shortcuts
  if (trimmedInput.toLowerCase() === 'today') {
    const today = new Date();
    return {
      isValid: true,
      date: today,
      formatted: formatDateForDisplay(localDateString(today), locale, dateFormat),
      partial: false
    };
  }
  
  if (trimmedInput.toLowerCase() === 'tomorrow') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      isValid: true,
      date: tomorrow,
      formatted: formatDateForDisplay(localDateString(tomorrow), locale, dateFormat),
      partial: false
    };
  }

  // Handle relative dates like "+7" (7 days from now)
  const relativeMatch = trimmedInput.match(/^[+]?(\d+)$/);
  if (relativeMatch) {
    const days = parseInt(relativeMatch[1], 10);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    return {
      isValid: true,
      date: futureDate,
      formatted: formatDateForDisplay(toISODateString(futureDate), locale, dateFormat),
      partial: false
    };
  }

  // Parse the input based on common separators
  const separatorRegex = /[-/.]/;
  const parts = trimmedInput.split(separatorRegex);
  
  // Determine expected format based on dateFormat setting
  const formatParts = dateFormat.split(separatorRegex);
  
  // Handle partial input (user is still typing)
  if (parts.length === 1 && parts[0].length <= 2) {
    // Just month or day entered
    return {
      isValid: false,
      date: null,
      formatted: trimmedInput,
      partial: true
    };
  }
  
  if (parts.length === 2) {
    // Month and day entered, need year
    const currentYear = new Date().getFullYear();
    let month: number, day: number;
    
    // Determine order based on format
    if (dateFormat.startsWith('DD')) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    } else if (dateFormat.startsWith('MM')) {
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
    } else {
      // Default to MM/DD
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
    }
    
    // Validate partial date
    if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      return {
        isValid: false,
        date: null,
        formatted: trimmedInput,
        partial: true,
        error: 'Invalid month or day'
      };
    }
    
    // Create date with current year
    const date = new Date(Date.UTC(currentYear, month - 1, day, 12, 0, 0));
    
    return {
      isValid: true,
      date: date,
      formatted: formatDateForDisplay(toISODateString(date), locale, dateFormat),
      partial: true
    };
  }
  
  if (parts.length === 3) {
    // Full date entered
    let year: number, month: number, day: number;
    
    // Parse based on format
    if (dateFormat.startsWith('DD')) {
      // DD/MM/YYYY
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    } else if (dateFormat.startsWith('YYYY')) {
      // YYYY/MM/DD
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else {
      // MM/DD/YYYY (default)
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    }
    
    // Handle 2-digit years
    if (year < 100) {
      const currentYear = new Date().getFullYear();
      const currentCentury = Math.floor(currentYear / 100) * 100;
      year = currentCentury + year;
      
      // If the result is more than 20 years in the future, assume previous century
      if (year > currentYear + 20) {
        year -= 100;
      }
    }
    
    // Validate date
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return {
        isValid: false,
        date: null,
        formatted: trimmedInput,
        partial: false,
        error: 'Invalid date format'
      };
    }
    
    if (year < 1000 || year > 9999) {
      return {
        isValid: false,
        date: null,
        formatted: trimmedInput,
        partial: false,
        error: 'Year must be between 1000 and 9999'
      };
    }
    
    if (month < 1 || month > 12) {
      return {
        isValid: false,
        date: null,
        formatted: trimmedInput,
        partial: false,
        error: 'Month must be between 1 and 12'
      };
    }
    
    if (day < 1 || day > 31) {
      return {
        isValid: false,
        date: null,
        formatted: trimmedInput,
        partial: false,
        error: 'Day must be between 1 and 31'
      };
    }
    
    // Check days in month
    const daysInMonth = [31, (isLeapYear(year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > daysInMonth[month - 1]) {
      return {
        isValid: false,
        date: null,
        formatted: trimmedInput,
        partial: false,
        error: `Day ${day} is invalid for month ${month}`
      };
    }
    
    // Create valid date
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    
    return {
      isValid: true,
      date: date,
      formatted: formatDateForDisplay(toISODateString(date), locale, dateFormat),
      partial: false
    };
  }
  
  // Invalid format
  return {
    isValid: false,
    date: null,
    formatted: trimmedInput,
    partial: false,
    error: 'Invalid date format'
  };
}

/**
 * Get placeholder text based on locale and format
 */
export function getLocalePlaceholder(locale: string = 'en-US', dateFormat: string = 'MM/DD/YYYY'): string {
  const formatMap: Record<string, string> = {
    'MM/DD/YYYY': 'MM/DD/YYYY',
    'DD/MM/YYYY': 'DD/MM/YYYY',
    'YYYY/MM/DD': 'YYYY/MM/DD',
    'DD-MM-YYYY': 'DD-MM-YYYY',
    'MM-DD-YYYY': 'MM-DD-YYYY',
    'YYYY-MM-DD': 'YYYY-MM-DD',
    'DD/MMM/YYYY': 'DD/MMM/YYYY',
    'DD-MMM-YYYY': 'DD-MMM-YYYY',
    'MMM DD, YYYY': 'MMM DD, YYYY',
    'default': 'MM/DD/YYYY'
  };
  
  return formatMap[dateFormat] || formatMap['default'];
}

/**
 * Format date specifically for locale input display
 */
export function formatDateForLocaleInput(
  date: Date,
  locale: string = 'en-US',
  dateFormat: string = 'MM/DD/YYYY'
): string {
  return formatDateForDisplay(toISODateString(date), locale, dateFormat);
}

export const DATE_FORMATS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY/MM/DD',
  'DD/MMM/YYYY',
  'DD-MM-YYYY',
  'MM-DD-YYYY',
  'YYYY-MM-DD',
  'DD-MMM-YYYY',
] as const;

export const DEFAULT_DATE_FORMAT = 'DD/MMM/YYYY';

// The settings column used to default to 'default' (and could hold ''), neither of which is a
// selectable format — anything unknown falls back to the default.
export function normalizeDateFormat(value: string | null | undefined): string {
  return value && (DATE_FORMATS as readonly string[]).includes(value) ? value : DEFAULT_DATE_FORMAT;
}

export const isAllTimeStart = (startDate: Date): boolean =>
  startDate.getTime() === new Date(1900, 0, 1).getTime();

export function formatDateRangeLabel(
  startDate: Date,
  endDate: Date,
  locale: string,
  dateFormat: string,
  allTimeLabel: string
): string {
  return isAllTimeStart(startDate)
    ? allTimeLabel
    : `${formatDateForDisplay(startDate, locale, dateFormat)} - ${formatDateForDisplay(endDate, locale, dateFormat)}`;
}
