import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: {} } },
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

// Add custom matchers for testing-library
expect.extend({
  toBeInTheDocument(received) {
    const pass = Boolean(received);
    return {
      pass,
      message: () => `expected ${received} to be in the document`,
    };
  },
  toHaveTextContent(received, expected) {
    const textContent = received?.textContent?.trim();
    const pass = textContent === expected;
    return {
      pass,
      message: () => `expected ${received} to have text content '${expected}', got '${textContent}'`,
    };
  }
});

// Clean up after each test
afterEach(() => {
  cleanup();
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock;

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.IntersectionObserver = IntersectionObserverMock;

// Mock for browser APIs that might not be available in the test environment
if (typeof window !== 'undefined') {
  window.matchMedia = window.matchMedia || function() {
    return {
      matches: false,
      addListener: function() {},
      removeListener: function() {},
      addEventListener: function() {},
      removeEventListener: function() {},
      dispatchEvent: function() { return false; },
    };
  };

  // Polyfill for hasPointerCapture
  if (!window.Element.prototype.hasPointerCapture) {
    window.Element.prototype.hasPointerCapture = () => false;
  }

  // Polyfill for scrollIntoView
  if (!window.Element.prototype.scrollIntoView) {
    window.Element.prototype.scrollIntoView = () => {};
  }
}