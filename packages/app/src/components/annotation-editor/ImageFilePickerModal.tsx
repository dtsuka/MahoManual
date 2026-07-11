import { useEffect, useRef, useState } from "react";
import { IconImage, IconX } from "../icons.js";
import { Button, Kbd, cx } from "../ui.js";

export const IMAGE_FILE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

interface ImageFilePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (file: File) => void;
  title: string;
  description?: string;
  modalTestId?: string;
  fileInputTestId?: string;
}

function isAcceptedImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function ImageFilePickerModal({
  open,
  onClose,
  onSelect,
  title,
  description,
  modalTestId,
  fileInputTestId,
}: ImageFilePickerModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setDragActive(false);
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleFile = (file: File | undefined) => {
    if (!file || !isAcceptedImageFile(file)) {
      return;
    }
    onSelect(file);
    onClose();
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      data-testid={modalTestId}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-file-picker-title"
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="image-file-picker-title" className="text-sm font-semibold text-slate-800">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="閉じる"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
          >
            <IconX size={14} />
          </button>
        </div>
        <div
          className={cx(
            "rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors duration-150",
            dragActive ? "border-blue-400 bg-blue-50/60" : "border-slate-300",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDragActive(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            handleFile(event.dataTransfer.files[0]);
          }}
        >
          <IconImage
            size={32}
            className={cx("mx-auto mb-2 transition-colors", dragActive ? "text-blue-500" : "text-slate-400")}
          />
          <p className="text-sm text-slate-600">
            画像ファイルをこの枠にドロップ
          </p>
          <p className="mt-1 text-xs text-slate-500">
            PNG / JPEG / WebP / GIF
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              ファイルを選択
            </Button>
            <span className="text-xs text-slate-500">
              または <Kbd>Esc</Kbd> で閉じる
            </span>
          </div>
          <input
            ref={fileInputRef}
            data-testid={fileInputTestId}
            type="file"
            accept={IMAGE_FILE_ACCEPT}
            className="hidden"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}
