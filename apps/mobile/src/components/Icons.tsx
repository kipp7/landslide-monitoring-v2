import type { CSSProperties, ReactNode } from "react";

type IconProps = {
  className?: string;
  style?: CSSProperties;
};

function iconPath(
  children: ReactNode,
  props: IconProps,
  viewBox = "0 0 24 24"
) {
  return (
    <svg
      aria-hidden="true"
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      style={props.style}
    >
      {children}
    </svg>
  );
}

export function MountainIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="M3 19 9.4 8.5a1 1 0 0 1 1.7 0l2.3 3.7 1.8-2.8a1 1 0 0 1 1.7 0L21 19" />
      <path d="M8 19h8" />
    </>,
    props
  );
}

export function RadarIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="M12 4a8 8 0 1 1-8 8" />
      <path d="M12 8a4 4 0 1 1-4 4" />
      <path d="m12 12 5.8-5.8" />
    </>,
    props
  );
}

export function TaskIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="M9 6h10" />
      <path d="M9 12h10" />
      <path d="M9 18h10" />
      <path d="m4 6 1.5 1.5L7.8 5" />
      <path d="m4 12 1.5 1.5L7.8 11" />
      <path d="m4 18 1.5 1.5L7.8 17" />
    </>,
    props
  );
}

export function UserIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>,
    props
  );
}

export function ChevronIcon(props: IconProps) {
  return iconPath(<path d="m9 6 6 6-6 6" />, props);
}

export function BellIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>,
    props
  );
}

export function ScanIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="M7 3H5a2 2 0 0 0-2 2v2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M17 21h2a2 2 0 0 0 2-2v-2" />
      <path d="M7 12h10" />
      <path d="M9 9h1" />
      <path d="M14 9h1" />
      <path d="M11.5 9h1" />
      <path d="M9 15h1" />
      <path d="M11 15h4" />
    </>,
    props
  );
}

export function PulseIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </>,
    props
  );
}

export function SignalIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="M4 18h1" />
      <path d="M8 15h1" />
      <path d="M12 12h1" />
      <path d="M16 8h1" />
      <path d="M20 5h1" />
    </>,
    props
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return iconPath(<path d="m15 18-6-6 6-6" />, props);
}

export function LayersIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </>,
    props
  );
}

export function ShieldIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="M12 3 5 6v5c0 4.5 2.8 7.4 7 10 4.2-2.6 7-5.5 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.7 1.7 3.3-3.7" />
    </>,
    props
  );
}

export function ClockIcon(props: IconProps) {
  return iconPath(
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.8 1.8" />
    </>,
    props
  );
}

export function RainIcon(props: IconProps) {
  return iconPath(
    <>
      <path d="M8 16a4 4 0 1 1 1.4-7.7A5 5 0 0 1 19 10a3.5 3.5 0 0 1-.7 6.9H8Z" />
      <path d="m8 18-1 2" />
      <path d="m12 18-1 2" />
      <path d="m16 18-1 2" />
    </>,
    props
  );
}
