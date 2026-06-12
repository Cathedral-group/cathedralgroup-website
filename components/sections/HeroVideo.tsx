'use client'

// Hero del brand film de la home: se reproduce UNA vez al cargar la página
// (autoplay, sin bucle, sin audio) y se queda FIJO en el último frame
// (escena velada + CATHEDRAL GROUP). Solo vuelve a reproducirse al recargar
// la página o al navegar fuera y volver a la home (el componente se remonta).
// Es above-the-fold y a pantalla completa → no necesita IntersectionObserver.
export default function HeroVideo() {
  return (
    <video
      className="absolute inset-0 w-full h-full object-cover"
      autoPlay
      muted
      playsInline
      preload="auto"
      poster="/video/hero-poster.jpg"
    >
      <source src="/video/hero-cathedral.mp4" type="video/mp4" />
    </video>
  )
}
