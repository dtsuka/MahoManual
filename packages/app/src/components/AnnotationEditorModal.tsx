import { useEffect, useRef, type ReactNode } from "react";

interface AnnotationEditorModalProps {
  labelledBy?: string;
  children: ReactNode;
}

/**
 * 注釈エディタ用の dialog shell。
 * mount されている＝開いている。閉じる操作・フォーカス復帰はホスト側。
 */
export function AnnotationEditorModal({ labelledBy, children }: AnnotationEditorModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey) {
        if (document.activeElement === first || document.activeElement === dialog) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center p-3 sm:p-4"
      data-testid="annotation-modal-backdrop"
    >
      {/* Backdrop - does NOT close on click (intentional: avoid accidental data loss) */}
      <div className="absolute inset-0 bg-slate-950/50" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-testid="annotation-modal"
        className="relative flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl outline-none"
      >
        {children}
      </div>
    </div>
  );
}
