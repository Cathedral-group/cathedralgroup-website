/**
 * Cathedral Group — GSAP Animations
 * Requires: GSAP + ScrollTrigger (loaded via CDN)
 */

document.addEventListener('DOMContentLoaded', () => {
  gsap.registerPlugin(ScrollTrigger);

  // Helper: create scroll-triggered animation with proper defaults
  function animateOnScroll(selector, fromVars, extraTriggerOpts) {
    gsap.utils.toArray(selector).forEach(el => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none',
          ...extraTriggerOpts
        }
      });
      tl.from(el, { duration: 1, ease: 'power3.out', ...fromVars });
    });
  }

  // =====================
  // FADE IN FROM BOTTOM
  // =====================
  animateOnScroll('[data-animate="fade-up"]', { y: 50, opacity: 0 });

  // =====================
  // FADE IN FROM LEFT
  // =====================
  animateOnScroll('[data-animate="fade-left"]', { x: -50, opacity: 0 });

  // =====================
  // FADE IN FROM RIGHT
  // =====================
  animateOnScroll('[data-animate="fade-right"]', { x: 50, opacity: 0 });

  // =====================
  // SCALE IN
  // =====================
  animateOnScroll('[data-animate="scale-in"]', { scale: 0.85, opacity: 0 });

  // =====================
  // REVEAL (clip-path wipe)
  // =====================
  animateOnScroll('[data-animate="reveal"]', {
    clipPath: 'inset(0 0 100% 0)',
    duration: 1.2,
    ease: 'power4.out'
  });

  // =====================
  // STAGGER CHILDREN
  // =====================
  gsap.utils.toArray('[data-animate="stagger"]').forEach(parent => {
    const children = gsap.utils.toArray(parent.children);
    gsap.set(children, { opacity: 1 }); // ensure visible by default

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: parent,
        start: 'top 85%',
        toggleActions: 'play none none none'
      }
    });
    tl.from(children, {
      y: 40,
      opacity: 0,
      duration: 0.7,
      stagger: 0.12,
      ease: 'power3.out'
    });
  });

  // =====================
  // PARALLAX IMAGE
  // =====================
  gsap.utils.toArray('[data-animate="parallax"]').forEach(el => {
    const inner = el.querySelector('div') || el.querySelector('img') || el;
    gsap.to(inner, {
      yPercent: -10,
      ease: 'none',
      scrollTrigger: {
        trigger: el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1.5
      }
    });
  });

  // =====================
  // COUNTER ANIMATION
  // =====================
  gsap.utils.toArray('[data-animate="counter"]').forEach(el => {
    const target = parseInt(el.getAttribute('data-count'), 10);
    const suffix = el.getAttribute('data-suffix') || '';
    const obj = { val: 0 };

    gsap.to(obj, {
      val: target,
      duration: 2,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 90%',
        toggleActions: 'play none none none'
      },
      onUpdate: () => {
        el.textContent = Math.floor(obj.val) + suffix;
      }
    });
  });

  // =====================
  // HEADER SCROLL EFFECT
  // =====================
  const header = document.querySelector('[data-animate="header"]');
  if (header) {
    ScrollTrigger.create({
      start: 'top -80',
      onUpdate: (self) => {
        if (self.scroll() > 80) {
          header.classList.add('header-solid');
          header.classList.remove('header-transparent');
        } else {
          header.classList.remove('header-solid');
          header.classList.add('header-transparent');
        }
      }
    });
  }

  // =====================
  // GRAYSCALE TO COLOR ON HOVER
  // =====================
  gsap.utils.toArray('[data-animate="grayscale"]').forEach(el => {
    el.style.filter = 'grayscale(100%)';
    el.style.transition = 'filter 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
    el.addEventListener('mouseenter', () => { el.style.filter = 'grayscale(0%)'; });
    el.addEventListener('mouseleave', () => { el.style.filter = 'grayscale(100%)'; });
  });

  // =====================
  // TEXT SPLIT REVEAL (hero headlines)
  // =====================
  gsap.utils.toArray('[data-animate="text-reveal"]').forEach(el => {
    gsap.from(el, {
      y: 80,
      opacity: 0,
      duration: 1.4,
      ease: 'power4.out',
      delay: 0.3
    });
  });

  // =====================
  // TIMELINE STEPS (process sections)
  // =====================
  gsap.utils.toArray('[data-animate="timeline"]').forEach(parent => {
    const steps = parent.querySelectorAll('[data-step]');
    steps.forEach((step, i) => {
      gsap.from(step, {
        opacity: 0.15,
        y: 25,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: step,
          start: 'top 85%',
          toggleActions: 'play none none none'
        },
        delay: i * 0.08
      });
    });
  });

  // Refresh ScrollTrigger after all animations are set up
  ScrollTrigger.refresh();
});
