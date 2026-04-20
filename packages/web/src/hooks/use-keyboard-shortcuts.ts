import { useEffect, useCallback } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description?: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
      const altMatch = shortcut.alt ? event.altKey : !event.altKey;
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
      
      if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
        event.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}

export function getShortcutLabel(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  
  if (shortcut.ctrl) {
    parts.push("Ctrl");
  }
  if (shortcut.meta) {
    parts.push("Cmd");
  }
  if (shortcut.shift) {
    parts.push("Shift");
  }
  if (shortcut.alt) {
    parts.push("Alt");
  }
  parts.push(shortcut.key.toUpperCase());
  
  return parts.join("+");
}

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { key: "1", ctrl: true, action: () => {}, description: "Go to Overview" },
  { key: "2", ctrl: true, action: () => {}, description: "Go to Search" },
  { key: "3", ctrl: true, action: () => {}, description: "Go to Ingest" },
  { key: "4", ctrl: true, action: () => {}, description: "Go to Wiki Pages" },
  { key: "5", ctrl: true, action: () => {}, description: "Go to Graph" },
  { key: "6", ctrl: true, action: () => {}, description: "Go to Tools" },
  { key: "/", ctrl: true, action: () => {}, description: "Focus search" },
  { key: "n", ctrl: true, action: () => {}, description: "New page" },
  { key: "r", ctrl: true, action: () => {}, description: "Refresh" },
];