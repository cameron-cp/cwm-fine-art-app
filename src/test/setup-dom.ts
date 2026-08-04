// jsdom lacks a handful of layout APIs that Radix primitives call on mount
// (scroll-area observes resizes; Select measures and scrolls its viewport).
// Node-environment tests share this setup file, hence the window guard.
if (typeof window !== "undefined") {
  if (!("ResizeObserver" in window)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as Record<string, unknown>).ResizeObserver =
      ResizeObserverStub;
    globalThis.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;
  }

  if (!("DOMRect" in window)) {
    (window as unknown as Record<string, unknown>).DOMRect = class {
      constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0,
      ) {}
      top = 0;
      left = 0;
      right = 0;
      bottom = 0;
    };
  }

  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  Element.prototype.hasPointerCapture ??= function hasPointerCapture() {
    return false;
  };
  Element.prototype.releasePointerCapture ??=
    function releasePointerCapture() {};
  Element.prototype.setPointerCapture ??= function setPointerCapture() {};
}
