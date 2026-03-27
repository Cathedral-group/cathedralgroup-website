'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 2,
    })

    // Connect Lenis to GSAP ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update)

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000)
    })
    gsap.ticker.lagSmoothing(0)

    // Handle anchor links
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a[href^="#"]') as HTMLAnchorElement
      if (anchor) {
        e.preventDefault()
        const id = anchor.getAttribute('href')
        if (id && id !== '#') {
          const el = document.querySelector(id)
          if (el) {
            lenis.scrollTo(el as HTMLElement, { offset: -80 })
          }
        }
      }
    }

    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
      lenis.destroy()
    }
  }, [])

  return null
}
