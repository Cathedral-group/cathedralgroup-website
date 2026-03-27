interface SectionLabelProps {
  text: string
  className?: string
}

export default function SectionLabel({ text, className = '' }: SectionLabelProps) {
  return (
    <span
      className={`text-primary text-sm font-bold uppercase tracking-[0.3em] mb-4 block ${className}`}
    >
      {text}
    </span>
  )
}
