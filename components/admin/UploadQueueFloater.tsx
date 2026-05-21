'use client'

/**
 * UploadQueueFloater — widget flotante esquina sup-derecha que muestra
 * progreso global cola upload. Visible desde cualquier página admin
 * cuando hay items pending/processing. Permite click → drill /admin/upload.
 */
import Link from 'next/link'
import { useUploadQueue } from '@/lib/upload-queue-context'

export default function UploadQueueFloater() {
  const { queue, batchRunning, currentItemId } = useUploadQueue()
  if (queue.length === 0) return null

  const total = queue.length
  const pending = queue.filter((q) => q.status === 'pending').length
  const processing = queue.filter((q) => q.status === 'processing').length
  const success = queue.filter((q) => q.status === 'success').length
  const error = queue.filter((q) => q.status === 'error').length
  const done = success + error
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const current = queue.find((q) => q.id === currentItemId)
  const currentName = current?.file.name

  return (
    <Link
      href="/admin/upload"
      className="fixed bottom-4 right-4 z-40 bg-white border border-neutral-200 shadow-lg rounded px-4 py-3 min-w-[260px] hover:shadow-xl transition-shadow"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          {batchRunning ? '⏳ Subiendo' : '📂 Cola'}
        </p>
        <span className="text-xs font-semibold text-neutral-700">
          {done}/{total}
        </span>
      </div>
      <div className="w-full h-1.5 bg-neutral-100 rounded overflow-hidden mb-2">
        <div
          className={`h-full transition-all ${
            error > 0 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-2 text-[10px] text-neutral-500">
        {processing > 0 && <span>🔄 {processing}</span>}
        {pending > 0 && <span>⏸ {pending}</span>}
        {success > 0 && <span className="text-emerald-600">✅ {success}</span>}
        {error > 0 && <span className="text-red-600">❌ {error}</span>}
      </div>
      {currentName && (
        <p className="text-[10px] text-neutral-400 mt-1 truncate">→ {currentName}</p>
      )}
    </Link>
  )
}
