import { useCallback, useRef, useState } from 'react';

export interface NavigationConfig {
  fields: string[];
  onAdvance: (from: string, to: string) => void;
  onSubmit: () => void;
  onFieldFocus?: (field: string) => void;
}

export interface KeyboardNavigationReturn {
  currentField: string;
  handleKeyDown: (event: React.KeyboardEvent, fieldName: string) => boolean;
  focusField: (fieldName: string) => void;
  advanceToNext: (currentFieldName: string) => void;
  getCurrentFieldIndex: () => number;
  registerFieldRef: (fieldName: string, element: HTMLElement | null) => void;
}

export function useKeyboardNavigation(config: NavigationConfig): KeyboardNavigationReturn {
  const { fields, onAdvance, onSubmit, onFieldFocus } = config;
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const fieldRefs = useRef<Map<string, HTMLElement>>(new Map());

  const currentField = fields[currentFieldIndex] || fields[0];

  const registerFieldRef = useCallback((fieldName: string, element: HTMLElement | null) => {
    if (element) {
      fieldRefs.current.set(fieldName, element);
    } else {
      fieldRefs.current.delete(fieldName);
    }
  }, []);

  const focusField = useCallback((fieldName: string) => {
    const element = fieldRefs.current.get(fieldName);
    if (element) {
      element.focus();
      onFieldFocus?.(fieldName);
    }
    const fieldIndex = fields.indexOf(fieldName);
    if (fieldIndex !== -1) {
      setCurrentFieldIndex(fieldIndex);
    }
  }, [fields, onFieldFocus]);

  const advanceToNext = useCallback((currentFieldName: string) => {
    const currentIndex = fields.indexOf(currentFieldName);
    if (currentIndex !== -1 && currentIndex < fields.length - 1) {
      const nextField = fields[currentIndex + 1];
      onAdvance(currentFieldName, nextField);
      setCurrentFieldIndex(currentIndex + 1);
      focusField(nextField);
    }
  }, [fields, onAdvance, focusField]);

  const goToPrevious = useCallback((currentFieldName: string) => {
    const currentIndex = fields.indexOf(currentFieldName);
    if (currentIndex > 0) {
      const previousField = fields[currentIndex - 1];
      onAdvance(currentFieldName, previousField);
      setCurrentFieldIndex(currentIndex - 1);
      focusField(previousField);
    }
  }, [fields, onAdvance, focusField]);

  const getCurrentFieldIndex = useCallback(() => {
    return currentFieldIndex;
  }, [currentFieldIndex]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, fieldName: string): boolean => {
    const fieldIndex = fields.indexOf(fieldName);
    
    // Handle Tab navigation
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) {
        // Shift+Tab - go to previous
        goToPrevious(fieldName);
      } else {
        // Tab - advance to next
        advanceToNext(fieldName);
      }
      return true;
    }

    // Handle Enter key contextually
    if (event.key === 'Enter') {
      // If this is the amount field or the last field, submit the form
      if (fieldName === 'amount' || fieldIndex === fields.length - 1) {
        event.preventDefault();
        onSubmit();
        return true;
      }
      
      // For other fields, let the component handle Enter first
      // The component should call advanceToNext if it handles the Enter
      return false;
    }

    // Handle Escape
    if (event.key === 'Escape') {
      const element = fieldRefs.current.get(fieldName);
      if (element) {
        element.blur();
      }
      return true;
    }

    return false;
  }, [fields, advanceToNext, goToPrevious, onSubmit]);

  return {
    currentField,
    handleKeyDown,
    focusField,
    advanceToNext,
    getCurrentFieldIndex,
    registerFieldRef,
  };
}