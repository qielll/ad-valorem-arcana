const PATHS = {
  in: 'M2 9L9 2L30 23L42 12L42 42L12 42L23 30Z',
  out: 'M2 35L9 42L30 21L42 32L42 2L12 2L23 14Z',
}

const COLORS = {
  in: '#5ab0ff',
  out: '#b5121b',
}

export default function TrendArrow({ type, className }) {
  return (
    <svg viewBox="0 0 44 44" className={className}>
      <path d={PATHS[type]} fill={COLORS[type]} />
    </svg>
  )
}
