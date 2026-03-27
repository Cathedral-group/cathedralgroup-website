const STATUS_STYLES: Record<string, string> = {
  nuevo: 'bg-blue-50 text-blue-700',
  contactado: 'bg-yellow-50 text-yellow-700',
  presupuestado: 'bg-purple-50 text-purple-700',
  aceptado: 'bg-green-50 text-green-700',
  rechazado: 'bg-red-50 text-red-700',
  completado: 'bg-neutral-100 text-neutral-700',
}

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.nuevo

  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${style}`}>
      {status}
    </span>
  )
}
