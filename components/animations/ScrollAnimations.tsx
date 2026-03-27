'use client'

import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function ScrollAnimations() {
  useEffect(() => {
    // Small delay to ensure DOM is painted
    const timer = requestAnimationFrame(() => {
      // Fade Up
      gsap.utils.toArray<HTMLElement>('[data-animate="fade-up"]').forEach((el) => {
        gsap.from(el, {
          y: 50,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
        })
      })

      // Fade Left
      gsap.utils.toArray<HTMLElement>('[data-animate="fade-left"]').forEach((el) => {
        gsap.from(el, {
          x: -50,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
        })
      })

      // Fade Right
      gsap.utils.toArray<HTMLElement>('[data-animate="fade-right"]').forEach((el) => {
        gsap.from(el, {
          x: 50,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
        })
      })

      // Scale In
      gsap.utils.toArray<HTMLElement>('[data-animate="scale-in"]').forEach((el) => {
        gsap.from(el, {
          scale: 0.85,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
        })
      })

      // Stagger children
      gsap.utils.toArray<HTMLElement>('[data-animate="stagger"]').forEach((container) => {
        const children = container.children
        gsap.from(children, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.12,
          ease: 'power3.out',
          scrollTrigger: { trigger: container, start: 'top 85%', toggleActions: 'play none none none' },
        })
      })

      // Parallax
      gsap.utils.toArray<HTMLElement>('[data-animate="parallax"]').forEach((el) => {
        gsap.to(el.children[0] || el, {
          yPercent: -10,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 1.5 },
        })
      })

      // Counter
      gsap.utils.toArray<HTMLElement>('[data-animate="counter"]').forEach((el) => {
        const target = parseInt(el.dataset.count || '0', 10)
        const suffix = el.dataset.suffix || ''
        const obj = { val: 0 }

        gsap.to(obj, {
          val: target,
          duration: 2,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
          onUpdate: () => {
            el.textContent = Math.floor(obj.val) + suffix
          },
        })
      })

      // Text Reveal
      gsap.utils.toArray<HTMLElement>('[data-animate="text-reveal"]').forEach((el) => {
        gsap.from(el, {
          y: 80,
          opacity: 0,
          duration: 1.2,
          delay: 0.3,
          ease: 'power3.out',
        })
      })

      ScrollTrigger.refresh()
    })

    return () => {
      cancelAnimationFrame(timer)
      ScrollTrigger.getAll().forEach((t) => t.kill())
    }
  }, [])

  return null
}
