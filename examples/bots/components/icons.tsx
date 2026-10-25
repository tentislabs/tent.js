import type { ReactNode } from 'react'

// The app's own line icons, on a grid of 24, so no icon of another company is taken.
function Line({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const SearchIcon = () => (
  <Line>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Line>
)

export const PlusIcon = () => (
  <Line>
    <path d="M12 5v14M5 12h14" />
  </Line>
)

export const CloseIcon = () => (
  <Line>
    <path d="M6 6l12 12M18 6 6 18" />
  </Line>
)

export const MicIcon = () => (
  <Line>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V20.5" />
  </Line>
)

export const WaveIcon = () => (
  <Line>
    <path d="M5 10v4M8.5 7v10M12 4.5v15M15.5 7v10M19 10v4" />
  </Line>
)

export const ScreenIcon = () => (
  <Line>
    <rect x="3.5" y="4.5" width="17" height="11.5" rx="2" />
    <path d="M9 20h6M12 16v4" />
  </Line>
)

export const GearIcon = () => (
  <Line>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </Line>
)

export const BarsIcon = () => (
  <Line>
    <path d="M6 20v-6M12 20V5M18 20v-9" />
  </Line>
)

export const BackIcon = () => (
  <Line>
    <path d="m15 5-7 7 7 7" />
  </Line>
)

export const CheckCircleIcon = () => (
  <Line>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
  </Line>
)

export const SparkIcon = () => (
  <Line>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </Line>
)

export function StarMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8Z" />
    </svg>
  )
}

export function VerifiedMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.8l2.5 1.9 3.1-.3 1 3 2.7 1.6-.7 3 1.4 2.8-2.4 2 .1 3.2-3.1.6-1.6 2.7-3-1.1-3 1.1-1.6-2.7-3.1-.6.1-3.2-2.4-2L3 11l-.7-3L5 6.4l1-3 3.1.3Z" />
      <path d="m8 12.2 2.7 2.7 5.3-5.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
