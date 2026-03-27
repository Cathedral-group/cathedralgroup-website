'use client'

import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

function animateElement(el: HTMLElement, from: gsap.TweenVars) {
  gsap.set(el, from)
  gsap.to(el, {
    ...Object.fromEntries(Object.keys(from).map(k => [k, k === 'opacity' ? 1 : 0])),
    duration: 1,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: el,
      start: 'top 88%',
      toggleActions: 'play none none none',
    },
  })
}

export default function ScrollAnimations() {
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      // Fade Up
      gsap.utils.toArray<HTMLElement>('[data-animate="fade-up"]').forEach((el) => {
        animateElement(el, { y: 50, opacity: 0 })
      })

      // Fade Left
      gsap.utils.toArray<HTMLElement>('[data-animate="fade-left"]').forEach((el) => {
        animateElement(el, { x: -50, opacity: 0 })
      })

      // Fade Right
      gsap.utils.toArray<HTMLElement>('[data-animate="fade-right"]').forEach((el) => {
        animateElement(el, { x: 50, opacity: 0 })
      })

      // Scale In
      gsap.utils.toArray<HTMLElement>('[data-animate="scale-in"]').forEach((el) => {
        animateElement(el, { scale: 0.85, opacity: 0 })
      })

      // Stagger children
      gsap.utils.toArray<HTMLElement>('[data-animate="stagger"]').forEach((container) => {
        const children = Array.from(container.children) as HTMLElement[]
        children.forEach((child) => gsap.set(child, { y: 40, opacity: 0 }))
        gsap.to(children, {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.12,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: container,
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
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
