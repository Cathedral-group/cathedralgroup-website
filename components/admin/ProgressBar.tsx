'use client'

interface ProgressBarProps {
  value: number
  color?: string
  height?: string
}

export default function ProgressBar({ value, color = 'bg-primary', height = 'h-2' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className={`w-full bg-neutral-200 ${height} overflow-hidden`}>
      <div
        className={`${color} ${height} transition-all duration-500 ease-out`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
