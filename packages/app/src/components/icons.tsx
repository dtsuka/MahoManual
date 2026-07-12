import type { ReactNode } from "react";

// 16px グリッドのストロークアイコン(stroke: currentColor / 1.5px)。
// 外部アイコン依存を持たず、UIで使う分だけを手書きで揃える。
interface IconProps {
  size?: number;
  className?: string;
}

function Icon({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 8H3.5" />
      <path d="M7.5 3.5 3 8l4.5 4.5" />
    </Icon>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </Icon>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 3.5 2.5 6.5l3 3" />
      <path d="M2.5 6.5H9a4 4 0 0 1 0 8H6.5" />
    </Icon>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m10.5 3.5 3 3-3 3" />
      <path d="M13.5 6.5H7a4 4 0 0 0 0 8h2.5" />
    </Icon>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.5V10" />
      <path d="M4.5 6.5 8 10l3.5-3.5" />
      <path d="M2.5 13.5h11" />
    </Icon>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3.5v9" />
      <path d="M3.5 8h9" />
    </Icon>
  );
}

export function IconBadge(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.75" />
      <text
        x="8"
        y="8.4"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="7.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        1
      </text>
    </Icon>
  );
}

export function IconType(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 5V3.5h9V5" />
      <path d="M8 3.5v9" />
      <path d="M6 12.5h4" />
    </Icon>
  );
}

export function IconPointer(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3 2.5 4.3 10.8 1.4-4.7 4.8-1.3z" />
    </Icon>
  );
}

export function IconSelect(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3 2.5 4.3 10.8 1.4-4.7 4.8-1.3z" fill="currentColor" stroke="currentColor" />
      <path d="m9 9 2.8 3" />
    </Icon>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 8h9" />
    </Icon>
  );
}

export function IconFit(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3H3v3" />
      <path d="M10 3h3v3" />
      <path d="M6 13H3v-3" />
      <path d="M10 13h3v-3" />
    </Icon>
  );
}

export function IconFrame(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </Icon>
  );
}

export function IconLine(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 12.5 12.5 3.5" />
    </Icon>
  );
}

export function IconArrowLine(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 12.5 12 4" />
      <path d="M7.5 3.5H12.5V8.5" />
    </Icon>
  );
}

export function IconList(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 4.5H13" />
      <path d="M6.5 8H13" />
      <path d="M6.5 11.5H13" />
      <circle cx="3.5" cy="4.5" r="0.5" fill="currentColor" />
      <circle cx="3.5" cy="8" r="0.5" fill="currentColor" />
      <circle cx="3.5" cy="11.5" r="0.5" fill="currentColor" />
    </Icon>
  );
}

export function IconImage(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="3" width="11" height="10" rx="1" />
      <circle cx="5.75" cy="6.25" r="1" />
      <path d="m2.5 10.5 3-3L8.5 10l2-2 3 3" />
    </Icon>
  );
}

export function IconMosaic(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" />
      <rect x="9" y="2.5" width="4.5" height="4.5" />
      <rect x="2.5" y="9" width="4.5" height="4.5" />
      <rect x="9" y="9" width="4.5" height="4.5" />
    </Icon>
  );
}

export function IconBook(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 4.4C6.6 3.2 4.8 3 2.75 3v9.6c2.05 0 3.85.2 5.25 1.4 1.4-1.2 3.2-1.4 5.25-1.4V3C11.2 3 9.4 3.2 8 4.4Z" />
      <path d="M8 4.4V14" />
    </Icon>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 5a1 1 0 0 1 1-1h3l1.5 1.8h4.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z" />
    </Icon>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.8 14 13H2Z" />
      <path d="M8 6.8v2.7" />
      <circle cx="8" cy="11.2" r="0.5" fill="currentColor" />
    </Icon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3 8.5 3.2 3L13 4.5" />
    </Icon>
  );
}

export function IconGrip(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="4" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="10" cy="4" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="6" cy="8" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="10" cy="8" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="10" cy="12" r="0.75" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
    </Icon>
  );
}

export function IconUnlock(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M10.5 7V5.5a2.5 2.5 0 0 0-4.7-1.2" />
    </Icon>
  );
}

export function IconEye(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.75 8s2.2-4 6.25-4 6.25 4 6.25 4-2.2 4-6.25 4S1.75 8 1.75 8Z" />
      <circle cx="8" cy="8" r="1.75" />
    </Icon>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.2 4.3C2.25 5.15 1.75 6 1.75 6s2.2 4 6.25 4c1.05 0 1.97-.27 2.76-.68" />
      <path d="M5.45 2.35A7.1 7.1 0 0 1 8 1.9c4.05 0 6.25 4.1 6.25 4.1a9.2 9.2 0 0 1-1.55 1.95" />
      <path d="M2 2l12 12" />
    </Icon>
  );
}

export function IconSolo(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.25" />
      <path d="M5 2.5H2.5V5" />
      <path d="M11 2.5h2.5V5" />
      <path d="M5 13.5H2.5V11" />
      <path d="M11 13.5h2.5V11" />
    </Icon>
  );
}

export function IconX(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 4 8 8" />
      <path d="m12 4-8 8" />
    </Icon>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5v3h-3" />
    </Icon>
  );
}
