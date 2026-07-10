import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { IconAlert, IconCheck } from "./icons.js";

// クラス結合ヘルパ(falsy を除外して連結)
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ============================================================
   Button / ButtonLink / IconButton
   同じ意味の操作は同じ見た目にするため、ボタンは必ずここを通す
   ============================================================ */

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-150";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white shadow-xs enabled:hover:bg-blue-700 enabled:active:bg-blue-800 disabled:opacity-40",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-xs enabled:hover:border-slate-400 enabled:hover:bg-slate-50 enabled:active:bg-slate-100 disabled:opacity-40",
  ghost:
    "text-slate-600 enabled:hover:bg-slate-200/70 enabled:hover:text-slate-900 enabled:active:bg-slate-200 disabled:opacity-40",
};

// a 要素には :enabled が効かないため hover をそのまま使う
const LINK_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white shadow-xs hover:bg-blue-700 active:bg-blue-800",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-xs hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 active:bg-slate-200",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-[13px]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], "disabled:cursor-not-allowed", className)}
      {...rest}
    />
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({ variant = "secondary", size = "md", className, ...rest }: ButtonLinkProps) {
  return <a className={cx(BUTTON_BASE, LINK_VARIANT[variant], BUTTON_SIZE[size], className)} {...rest} />;
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: ButtonSize;
  /** true なら title の代わりに CSS ツールチップ(data-tip)で label を表示する */
  tip?: boolean;
}

export function IconButton({ label, tip, size = "md", className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={tip ? undefined : label}
      data-tip={tip ? label : undefined}
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANT.ghost,
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        "disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    />
  );
}

/* ============================================================
   フォーム部品
   ============================================================ */

const CONTROL_BASE =
  "rounded-md border border-slate-300 bg-white text-slate-900 shadow-xs transition-colors duration-150 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40";

const CONTROL_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2 text-xs",
  md: "h-8 px-2.5 text-sm",
};

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  uiSize?: ButtonSize;
}

export function TextInput({ uiSize = "md", className, ...rest }: TextInputProps) {
  return <input className={cx(CONTROL_BASE, CONTROL_SIZE[uiSize], className)} {...rest} />;
}

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  uiSize?: ButtonSize;
}

export function SelectInput({ uiSize = "md", className, ...rest }: SelectInputProps) {
  return (
    <select
      className={cx(CONTROL_BASE, CONTROL_SIZE[uiSize], "ui-select appearance-none pr-7", className)}
      {...rest}
    />
  );
}

// カラーピッカー。ブラウザ既定のスウォッチ余白を消し、他のコントロールと高さを揃える
export function ColorInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="color"
      className={cx(
        "h-8 w-full cursor-pointer rounded-md border border-slate-300 bg-white p-1 shadow-xs transition-colors duration-150 hover:border-slate-400",
        "[&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-none",
        className,
      )}
      {...rest}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

/* ============================================================
   表示部品
   ============================================================ */

type BannerKind = "success" | "warning" | "danger";

const BANNER_KIND: Record<BannerKind, string> = {
  success: "border-emerald-100 bg-emerald-50 text-emerald-800",
  warning: "border-amber-100 bg-amber-50 text-amber-800",
  danger: "border-red-100 bg-red-50 text-red-700",
};

interface BannerProps {
  kind: BannerKind;
  children: ReactNode;
  className?: string;
  testId?: string;
  role?: string;
}

export function Banner({ kind, children, className, testId, role }: BannerProps) {
  const IconGlyph = kind === "success" ? IconCheck : IconAlert;
  return (
    <div
      data-testid={testId}
      role={role}
      className={cx("flex items-center gap-2 border-b px-4 py-2 text-sm", BANNER_KIND[kind], className)}
    >
      <IconGlyph size={14} className="shrink-0" />
      {children}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-lg border border-slate-200 bg-white shadow-xs", className)}>{children}</div>;
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-10 text-center">
      {icon ? <div className="mb-1 text-slate-300">{icon}</div> : null}
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint ? <p className="max-w-sm text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

// 「未保存」バッジ。e2e テストが text=未保存 を参照するため文言は固定
export function DirtyBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      未保存
    </span>
  );
}

export function Separator() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-slate-300 bg-slate-50 px-1 py-px font-mono text-[10px] text-slate-600">
      {children}
    </kbd>
  );
}

// ブランドマーク: マゼンタの丸数字バッジ(このツールの署名的オブジェクト)
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-(--color-brand) font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      1
    </span>
  );
}
