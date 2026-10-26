import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  togglePlay: () => void;
  seekBy: (seconds: number) => void;
  focusSearch: () => void;
  selectTab: (index: number) => void;
  selectRelative: (delta: number) => void;
  toggleHelp: () => void;
}

const isTypingTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
};

/** Global shortcuts; ignored while typing in a field or when a modifier key is held. */
export const useKeyboardShortcuts = (handlers: ShortcutHandlers) => {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const h = {
      togglePlay: () => ref.current.togglePlay(),
      seekBy: (s: number) => ref.current.seekBy(s),
      focusSearch: () => ref.current.focusSearch(),
      selectTab: (i: number) => ref.current.selectTab(i),
      selectRelative: (d: number) => ref.current.selectRelative(d),
      toggleHelp: () => ref.current.toggleHelp(),
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      // Let focused buttons/tabs keep their native Space/Enter behaviour
      const onControl = e.target instanceof HTMLElement && ['BUTTON', 'A'].includes(e.target.tagName);
      switch (e.key) {
        case ' ':
          if (onControl) return;
          e.preventDefault();
          h.togglePlay();
          break;
        case 'ArrowLeft':
          if (e.target instanceof HTMLElement && e.target.getAttribute('role') === 'tab') return;
          h.seekBy(e.shiftKey ? -15 : -5);
          break;
        case 'ArrowRight':
          if (e.target instanceof HTMLElement && e.target.getAttribute('role') === 'tab') return;
          h.seekBy(e.shiftKey ? 15 : 5);
          break;
        case '/':
          e.preventDefault();
          h.focusSearch();
          break;
        case 'j':
          h.selectRelative(1);
          break;
        case 'k':
          h.selectRelative(-1);
          break;
        case '?':
          h.toggleHelp();
          break;
        default:
          if (/^[1-5]$/.test(e.key)) h.selectTab(Number(e.key) - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};
