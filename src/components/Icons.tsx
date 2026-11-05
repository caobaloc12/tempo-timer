import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function iconProps(props: IconProps): IconProps {
  return {
    viewBox: '0 0 24 24',
    width: 24,
    height: 24,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  }
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SkipIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 5.5v13l10-6.5z" fill="currentColor" stroke="none" />
      <path d="M18 5v14" />
    </svg>
  )
}

export function StopIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2" fill="currentColor" stroke="none" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="8" cy="17" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ResetIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 10a8 8 0 1 1 2.3 6" />
      <path d="M4 4v6h6" />
    </svg>
  )
}
