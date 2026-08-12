import { useEffect, useCallback } from 'react';

type KeyHandler = (event: KeyboardEvent) => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: KeyHandler;
  preventDefault?: boolean;
}

/**
 * Hook for multiple keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' ||
                      target.tagName === 'TEXTAREA' ||
                      target.isContentEditable;

      for (const shortcut of shortcuts) {
        const { key, ctrl, meta, shift, alt, handler, preventDefault = true } = shortcut;

        // Allow Escape in inputs, block others
        if (isInput && key.toLowerCase() !== 'escape') {
          continue;
        }

        const keyMatches = event.key.toLowerCase() === key.toLowerCase();
        const shiftMatches = shift ? event.shiftKey : !event.shiftKey;
        const altMatches = alt ? event.altKey : !event.altKey;

        // Handle Cmd/Ctrl shortcuts (works on both Mac and Windows)
        if (ctrl) {
          if ((event.ctrlKey || event.metaKey) && keyMatches && shiftMatches && altMatches) {
            if (preventDefault) {
              event.preventDefault();
            }
            handler(event);
            return;
          }
          continue;
        }

        // Handle meta-only shortcuts
        if (meta) {
          if (event.metaKey && !event.ctrlKey && keyMatches && shiftMatches && altMatches) {
            if (preventDefault) {
              event.preventDefault();
            }
            handler(event);
            return;
          }
          continue;
        }

        // Handle regular shortcuts (no modifiers)
        if (!event.ctrlKey && !event.metaKey && keyMatches && shiftMatches && altMatches) {
          if (preventDefault) {
            event.preventDefault();
          }
          handler(event);
          return;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

export default useKeyboardShortcuts;
