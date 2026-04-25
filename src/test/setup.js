import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia; some libs (react-hot-toast for
// prefers-reduced-motion) call it on mount.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
