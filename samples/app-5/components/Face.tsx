import type { ReactElement } from 'react'
import { type BotShape, botShapes } from '../lib/looks'
import { colourOf } from './looks'

type Body = (fill: string) => ReactElement

// A rounded polygon: the fill and a thick round stroke of the same colour soften its corners.
const soft = (points: string, width = 14): Body =>
  function Soft(fill) {
    return <polygon points={points} fill={fill} stroke={fill} strokeWidth={width} strokeLinejoin="round" />
  }

function ring(count: number, radius: number, centre: number, from = -90): string {
  const points: string[] = []
  for (let i = 0; i < count; i++) {
    const angle = ((from + (360 / count) * i) * Math.PI) / 180
    points.push(`${(50 + radius * Math.cos(angle)).toFixed(1)},${(centre + radius * Math.sin(angle)).toFixed(1)}`)
  }
  return points.join(' ')
}

const PETALS = [0, 1, 2, 3, 4].map((i) => {
  const angle = ((-90 + 72 * i) * Math.PI) / 180
  return { key: `p${i}`, x: 50 + 26 * Math.cos(angle), y: 52 + 26 * Math.sin(angle) }
})

const BODIES: Record<BotShape, Body> = {
  round: (fill) => <circle cx="50" cy="50" r="46" fill={fill} />,
  cloud: (fill) => (
    <g fill={fill}>
      <circle cx="33" cy="55" r="27" />
      <circle cx="67" cy="55" r="27" />
      <circle cx="50" cy="36" r="28" />
      <rect x="20" y="52" width="60" height="30" rx="14" />
    </g>
  ),
  square: (fill) => <rect x="10" y="10" width="80" height="80" rx="18" fill={fill} transform="rotate(-9 50 50)" />,
  star: (fill) => (
    <path
      d="M50 4 C58 30 70 42 96 50 C70 58 58 70 50 96 C42 70 30 58 4 50 C30 42 42 30 50 4 Z"
      fill={fill}
      stroke={fill}
      strokeWidth="10"
      strokeLinejoin="round"
    />
  ),
  flower: (fill) => (
    <g fill={fill}>
      {PETALS.map((one) => (
        <circle key={one.key} cx={one.x} cy={one.y} r="22" />
      ))}
      <circle cx="50" cy="52" r="28" />
    </g>
  ),
  heart: (fill) => (
    <path
      d="M50 90 C20 72 6 54 8 36 C10 18 30 10 42 20 L50 27 L58 20 C70 10 90 18 92 36 C94 54 80 72 50 90 Z"
      fill={fill}
      stroke={fill}
      strokeWidth="6"
      strokeLinejoin="round"
    />
  ),
  drop: (fill) => (
    <path d="M50 6 C66 26 86 44 86 62 C86 82 70 94 50 94 C30 94 14 82 14 62 C14 44 34 26 50 6 Z" fill={fill} />
  ),
  triangle: soft('50,16 88,82 12,82', 18),
  hexagon: soft(ring(6, 38, 50, -90), 14),
  diamond: soft('50,8 90,50 50,92 10,50', 16),
  leaf: (fill) => (
    <path
      d="M12 88 C8 46 30 12 88 12 C92 54 70 88 12 88 Z"
      fill={fill}
      stroke={fill}
      strokeWidth="4"
      strokeLinejoin="round"
    />
  ),
  ghost: (fill) => (
    <path
      d="M14 52 C14 26 30 8 50 8 C70 8 86 26 86 52 L86 90 L72 80 L61 92 L50 80 L39 92 L28 80 L14 90 Z"
      fill={fill}
      stroke={fill}
      strokeWidth="6"
      strokeLinejoin="round"
    />
  ),
  pill: (fill) => <rect x="8" y="24" width="84" height="52" rx="26" fill={fill} transform="rotate(-20 50 50)" />,
}

/** The face of a bot: its shape in its colour, with two eyes, drawn by the app itself. */
export function Face({
  shape,
  colour,
  size = 42,
  label,
}: {
  shape: string | undefined
  colour: string | undefined
  size?: number
  label?: string
}) {
  const known = botShapes.find((one) => one === shape) ?? 'round'
  const fill = colourOf(colour)
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ flex: 'none', display: 'block' }}
    >
      {BODIES[known](fill)}
      <rect x="35" y="36" width="10" height="22" rx="5" fill="#141414" />
      <rect x="55" y="36" width="10" height="22" rx="5" fill="#141414" />
    </svg>
  )
}
