import { format, parseISO } from 'date-fns';

/**
 * Format a Date or ISO string for comparison in tests
 * @param date Date object or ISO string
 * @param formatString Format string for date-fns
 * @returns Formatted date string
 */
export function formatDate(date: Date | string, formatString = 'yyyy-MM-dd'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatString);
}

/**
 * Delays execution for a specified amount of time
 * @param ms Milliseconds to wait
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a partial mock that allows you to mock only specific properties
 * @param implementation The implementation to mock
 * @returns Partial mock
 */
export function createPartialMock<T extends object>(implementation: Partial<T> = {}): T {
  return {
    ...implementation
  } as T;
}

/**
 * Utility to find a specific element by its accessible name and role
 * @param container The element to search within
 * @param name The accessible name
 * @param role The element role
 * @returns The found element or null
 */
export function findByAccessibleName(container: HTMLElement, name: string, role: string): HTMLElement | null {
  return container.querySelector(`[role="${role}"][aria-label="${name}"], [role="${role}"]:has(label:contains('${name}'))`);
}

/**
 * Utility to wait for an element to appear in the DOM
 * @param callback Function that returns the element to wait for
 * @param options Configuration options
 * @returns Promise that resolves with the element
 */
export async function waitForElement<T>(
  callback: () => T | null, 
  { timeout = 1000, interval = 50 } = {}
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Element not found within ${timeout}ms`));
    }, timeout);
  });
  
  const checkElement = async (): Promise<T> => {
    const element = callback();
    
    if (element) {
      clearTimeout(timeoutId);
      return element;
    }
    
    await delay(interval);
    return checkElement();
  };
  
  return Promise.race([checkElement(), timeoutPromise]);
}

/**
 * Helper to create a function with custom implementation and spying capabilities
 * @param implementation Function implementation
 * @returns Function with attached mock property for assertions
 */
export function createMockFunction<T extends (...args: any[]) => any>(
  implementation: T
): T & { mock: { calls: any[][] } } {
  const calls: any[][] = [];
  
  const fn = ((...args: any[]) => {
    calls.push([...args]);
    return implementation(...args);
  }) as T & { mock: { calls: any[][] } };
  
  fn.mock = { calls };
  
  return fn;
}