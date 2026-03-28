'use client'

import { useState } from 'react'
import Link from 'next/link'

const ACTIONS = [
  { label: 'Nueva factura', href: '/admin/facturas' },
  { label: 'Nuevo cliente', href: '/admin/clientes' },
  { label: 'Nuevo proyecto', href: '/admin/proyectos' },
]

export default function QuickAddButton() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-10 h-10 bg-neutral-900 text-white rounded-full flex items-center justify-center hover:bg-primary transition-colors text-xl"
      >
        +
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 bg-white border border-neutral-200 shadow-lg py-2 w-48">
            {ACTIONS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm hover:bg-neutral-50 transition-colors"
              >
                {label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
