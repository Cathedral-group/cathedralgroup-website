'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function ScrollAnimations() {
  const pathname = usePathname()

  useEffect(() => {
    // Kill previous triggers
    ScrollTrigger.getAll().forEach((t) => t.kill())

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      // Fade Up
      gsap.utils.toArray<HTMLElement>('[data-animate="fade-up"]').forEach((el) => {
        gsap.fromTo(el,
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 92%' } }
        )
      })

      // Fade Left
      gsap.utils.toArray<HTMLElement>('[data-animate="fade-left"]').forEach((el) => {
        gsap.fromTo(el,
          { x: -40, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.8, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 92%' } }
        )
      })

      // Fade Right
      gsap.utils.toArray<HTMLElement>('[data-animate="fade-right"]').forEach((el) => {
        gsap.fromTo(el,
          { x: 40, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.8, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 92%' } }
        )
      })

      // Scale In
      gsap.utils.toArray<HTMLElement>('[data-animate="scale-in"]').forEach((el) => {
        gsap.fromTo(el,
          { scale: 0.9, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.8, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 92%' } }
        )
      })

      // Stagger children
      gsap.utils.toArray<HTMLElement>('[data-animate="stagger"]').forEach((container) => {
        const children = Array.from(container.children) as HTMLElement[]
        gsap.fromTo(children,
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: 'power3.out',
            scrollTrigger: { trigger: container, start: 'top 92%' } }
        )
      })

      // Parallax
      gsap.utils.toArray<HTMLElement>('[data-animate="parallax"]').forEach((el) => {
        gsap.to(el.children[0] || el, {
          yPercent: -10, ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 1.5 },
        })
      })

      // Counter
      gsap.utils.toArray<HTMLElement>('[data-animate="counter"]').forEach((el) => {
        const target = parseInt(el.dataset.count || '0', 10)
        const suffix = el.dataset.suffix || ''
        const obj = { val: 0 }
        gsap.to(obj, {
          val: target, duration: 2, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 92%' },
          onUpdate: () => { el.textContent = Math.floor(obj.val) + suffix },
        })
      })

      // Text Reveal (no scroll trigger — immediate)
      gsap.utils.toArray<HTMLElement>('[data-animate="text-reveal"]').forEach((el) => {
        gsap.fromTo(el,
          { y: 60, opacity: 0 },
          { y: 0, opacity: 1, duration: 1, delay: 0.2, ease: 'power3.out' }
        )
      })

      ScrollTrigger.refresh()
    }, 100)

    return () => {
      clearTimeout(timer)
      ScrollTrigger.getAll().forEach((t) => t.kill())
    }
  }, [pathname])

  return null
}
