'use client'

import { useEffect, useRef } from 'react'

// Hero del brand film de la home: se reproduce UNA vez (sin bucle) y se queda
// en el último frame (logo + CATHEDRAL GROUP). Cuando el hero sale de la vista
// y vuelve a entrar (scroll arriba), se reinicia y reproduce de nuevo. Sin audio.
export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          v.currentTime = 0
          v.play().catch(() => {})
        } else {
          v.pause()
        }
      },
      { threshold: 0.35 }
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])

  return (
    <video
      ref={ref}
      className="absolute inset-0 w-full h-full object-cover"
      muted
      playsInline
      preload="auto"
      poster="/video/hero-poster.jpg"
    >
      <source src="/video/hero-cathedral.mp4" type="video/mp4" />
    </video>
  )
}
