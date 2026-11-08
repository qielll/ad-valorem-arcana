// Points use mockup coordinates (1920x1080) and are converted to percentages,
// so background shapes stretch to fill any window.
const toClip = (pts) =>
  `polygon(${pts.map(([x, y]) => `${(x / 19.2).toFixed(2)}% ${(y / 10.8).toFixed(2)}%`).join(', ')})`

export default function Shape({ points, className = '', children }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{ clipPath: toClip(points) }}
    >
      {children}
    </div>
  )
}
