import { Keyboard, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { modKeySymbol } from '../../lib/format';
import { useVaultStore } from '../../store/useVaultStore';

export function ShortcutsModal() {
  const open = useVaultStore((s) => s.shortcutsModalOpen);
  const setOpen = useVaultStore((s) => s.setShortcutsModalOpen);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      setTimeout(() => closeBtnRef.current?.focus(), 10);
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  const mod = modKeySymbol();

  const sections = [
    {
      title: 'Navigation & Search',
      items: [
        { keys: `${mod}K`, label: 'Open Command Palette' },
        { keys: '/', label: 'Focus search bar' },
        { keys: '↑ / ↓ or J / K', label: 'Move focus in file list or grid' },
        { keys: 'Enter', label: 'Open folder or toggle file inspector' },
        { keys: 'Space', label: 'Open live preview modal for focused file' },
        { keys: '?', label: 'Show this keyboard shortcuts sheet' },
      ],
    },
    {
      title: 'Selection & File Actions',
      items: [
        { keys: `${mod}A`, label: 'Select all items in current view' },
        { keys: 'Shift + Click', label: 'Select contiguous range of items' },
        { keys: `${mod}Click`, label: 'Toggle individual item selection' },
        { keys: 'Esc', label: 'Clear selection or close active dialog' },
        { keys: 'F2', label: 'Rename selected item' },
        { keys: 'S', label: 'Star or unstar selected items' },
        { keys: 'Delete / Backspace', label: 'Move selected items to Trash' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E2230]">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[#818CF8]" aria-hidden="true" />
            <h2 id="shortcuts-modal-title" className="text-[15px] font-bold text-[#F3F4F6]">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close keyboard shortcuts"
            className="p-1 text-[#8A94A6] hover:text-[#F3F4F6] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {sections.map((sec) => (
            <div key={sec.title}>
              <h3 className="text-xs font-medium text-[#8A94A6] mb-2.5">{sec.title}</h3>
              <div className="divide-y divide-[#1E2230] border border-[#1E2230] rounded-md bg-[#0E1017]">
                {sec.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-3.5 py-2 text-[13px]"
                  >
                    <span className="text-[#F3F4F6]">{item.label}</span>
                    <kbd className="font-mono text-xs text-[#818CF8] bg-[#131620] border border-[#1E2230] px-2 py-0.5 rounded whitespace-nowrap">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
