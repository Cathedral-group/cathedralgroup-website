'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/translations'

/* ── Schema.org WebApplication (injected once) ── */
const WEB_APP_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Calculadora de Presupuesto de Reforma | Cathedral Group',
  url: 'https://cathedralgroup.es/presupuesto',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  description:
    'Calculadora interactiva para estimar el presupuesto de una reforma de lujo en Madrid.',
  provider: {
    '@type': 'HomeAndConstructionBusiness',
    name: 'Cathedral Group',
    url: 'https://cathedralgroup.es',
    telephone: '+34684725606',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Paseo de la Castellana 40, 8\u00ba',
      addressLocality: 'Madrid',
      postalCode: '28046',
      addressCountry: 'ES',
    },
  },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'EUR',
    description: 'Estimación gratuita de presupuesto de reforma',
  },
}

/* ── Constants ── */
const TOTAL_STEPS = 5

const PROJECT_TYPES = [
  { key: 'reformaIntegral', icon: '◻' },
  { key: 'reformaParcial', icon: '▣' },
  { key: 'interiorismo', icon: '◈' },
  { key: 'cambioUso', icon: '⬡' },
  { key: 'obraNueva', icon: '△' },
] as const

const ZONES = [
  { key: 'zonePremiumPlus', tagKey: 'zonePremiumPlusTag', multiplier: 1.15 },
  { key: 'zonePremium', tagKey: 'zonePremiumTag', multiplier: 1.10 },
  { key: 'zoneStandard', tagKey: 'zoneStandardTag', multiplier: 1.0 },
  { key: 'zoneOther', tagKey: 'zoneOtherTag', multiplier: 1.0 },
] as const

const FINISH_LEVELS = [
  { key: 'standard', rangeKey: 'standardRange', descKey: 'standardDesc', min: 600, max: 800 },
  { key: 'premium', rangeKey: 'premiumRange', descKey: 'premiumDesc', min: 800, max: 1200 },
  { key: 'luxury', rangeKey: 'luxuryRange', descKey: 'luxuryDesc', min: 1200, max: 1800 },
  { key: 'ultraLuxury', rangeKey: 'ultraLuxuryRange', descKey: 'ultraLuxuryDesc', min: 1800, max: 2500 },
] as const

const EXTRAS = [
  { key: 'domotica', descKey: 'domoticaDesc', minCost: 8000, maxCost: 25000 },
  { key: 'cocinaPremium', descKey: 'cocinaPremiumDesc', minCost: 15000, maxCost: 45000 },
  { key: 'climatizacion', descKey: 'climatizacionDesc', minCost: 6000, maxCost: 18000 },
  { key: 'iluminacion', descKey: 'iluminacionDesc', minCost: 4000, maxCost: 15000 },
  { key: 'mobiliario', descKey: 'mobiliarioDesc', minCost: 12000, maxCost: 40000 },
] as const

/* ── Helpers ── */
function formatPrice(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

/* ── Component ── */
export default function PresupuestoPage() {
  const t = useT('calculator')

  /* Add class to body so WhatsApp button moves up */
  useEffect(() => {
    document.body.classList.add('has-sticky-nav')
    return () => document.body.classList.remove('has-sticky-nav')
  }, [])

  /* state */
  const [step, setStep] = useState(1)
  const [projectType, setProjectType] = useState<string | null>(null)
  const [zone, setZone] = useState<number | null>(null)
  const [sqm, setSqm] = useState(120)
  const [finishLevel, setFinishLevel] = useState<number | null>(null)
  const [extras, setExtras] = useState<Set<string>>(new Set())
  const [showResult, setShowResult] = useState(false)

  const toggleExtra = useCallback((key: string) => {
    setExtras(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  /* navigation guards */
  const canAdvance = () => {
    if (step === 1) return projectType !== null
    if (step === 2) return zone !== null
    if (step === 3) return sqm >= 30
    if (step === 4) return finishLevel !== null
    return true
  }

  const goNext = () => {
    if (step < TOTAL_STEPS) setStep(step + 1)
    else calculateResult()
  }

  const goPrev = () => {
    if (showResult) { setShowResult(false); return }
    if (step > 1) setStep(step - 1)
  }

  /* calculation */
  const calculateResult = () => setShowResult(true)

  const getResults = () => {
    const finish = FINISH_LEVELS[finishLevel ?? 0]
    const zoneMultiplier = ZONES[zone ?? 2].multiplier

    let baseMin = finish.min * sqm * zoneMultiplier
    let baseMax = finish.max * sqm * zoneMultiplier

    let extrasMin = 0
    let extrasMax = 0
    extras.forEach(k => {
      const e = EXTRAS.find(x => x.key === k)
      if (e) { extrasMin += e.minCost; extrasMax += e.maxCost }
    })

    const totalMin = baseMin + extrasMin
    const totalMax = baseMax + extrasMax

    // Breakdown percentages (approximate)
    const obraMin = totalMin * 0.40
    const obraMax = totalMax * 0.40
    const matMin = totalMin * 0.30
    const matMax = totalMax * 0.30
    const disMin = totalMin * 0.18
    const disMax = totalMax * 0.18
    const gestMin = totalMin * 0.12
    const gestMax = totalMax * 0.12

    return {
      totalMin, totalMax,
      breakdown: [
        { key: 'obraLabel', min: obraMin, max: obraMax, pct: 40 },
        { key: 'materialesLabel', min: matMin, max: matMax, pct: 30 },
        { key: 'disenoLabel', min: disMin, max: disMax, pct: 18 },
        { key: 'gestionLabel', min: gestMin, max: gestMax, pct: 12 },
      ],
    }
  }

  const reset = () => {
    setStep(1)
    setProjectType(null)
    setZone(null)
    setSqm(120)
    setFinishLevel(null)
    setExtras(new Set())
    setShowResult(false)
  }

  /* ── Render helpers ── */
  const ProgressBar = () => (
    <div className="flex items-center gap-2 mb-10">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div key={i} className="flex items-center gap-2 flex-1">
          <div
            className={`h-1 flex-1 transition-all duration-500 ${
              i < step ? 'bg-primary' : 'bg-neutral-300'
            }`}
          />
        </div>
      ))}
    </div>
  )

  const StepHeader = ({ titleKey, subtitleKey }: { titleKey: string; subtitleKey: string }) => (
    <div className="mb-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary mb-3">
        {t('step')} {step} {t('of')} {TOTAL_STEPS}
      </p>
      <h2 className="text-fluid-xl font-light uppercase tracking-wide text-neutral-800 mb-2">
        {t(titleKey)}
      </h2>
      <p className="text-neutral-500 text-sm">{t(subtitleKey)}</p>
    </div>
  )

  const NavButtons = () => (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-neutral-200 px-6 py-4 flex items-center justify-between">
      <button
        onClick={goPrev}
        className={`text-xs font-bold uppercase tracking-[0.15em] text-neutral-500 hover:text-neutral-800 transition-colors ${
          step === 1 && !showResult ? 'invisible' : ''
        }`}
      >
        ← {t('prev')}
      </button>
      <button
        onClick={goNext}
        disabled={!canAdvance()}
        className={`px-10 py-3.5 text-xs font-bold uppercase tracking-[0.15em] transition-all duration-500 ${
          canAdvance()
            ? 'bg-[#5A5550] text-white hover:bg-[#4A4540]'
            : 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
        }`}
      >
        {step === TOTAL_STEPS ? t('calculate') : t('next')} →
      </button>
    </div>
  )

  /* ── Selection card component ── */
  const SelectionCard = ({
    selected,
    onClick,
    children,
  }: {
    selected: boolean
    onClick: () => void
    children: React.ReactNode
  }) => (
    <button
      onClick={onClick}
      className={`w-full text-left p-5 border transition-all duration-300 group ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-neutral-200 hover:border-primary/50 bg-white'
      }`}
    >
      {children}
    </button>
  )

  /* ── Steps ── */
  const Step1 = () => (
    <div>
      <StepHeader titleKey="step1Title" subtitleKey="step1Subtitle" />
      <div className="grid md:grid-cols-2 gap-3">
        {PROJECT_TYPES.map(({ key, icon }) => (
          <SelectionCard
            key={key}
            selected={projectType === key}
            onClick={() => { setProjectType(key); setTimeout(() => setStep(2), 300) }}
          >
            <div className="flex items-center gap-4">
              <span className="text-2xl text-primary opacity-60">{icon}</span>
              <div>
                <p className="text-sm font-medium text-neutral-800">{t(key)}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{t(`${key}Desc`)}</p>
              </div>
            </div>
          </SelectionCard>
        ))}
      </div>
      <NavButtons />
    </div>
  )

  const Step2 = () => (
    <div>
      <StepHeader titleKey="step2Title" subtitleKey="step2Subtitle" />
      <div className="space-y-3">
        {ZONES.map((z, i) => (
          <SelectionCard key={z.key} selected={zone === i} onClick={() => { setZone(i); setTimeout(() => setStep(3), 300) }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-neutral-800">{t(z.key)}</p>
              <span
                className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 ${
                  z.multiplier > 1
                    ? 'text-primary bg-primary/10'
                    : 'text-neutral-500 bg-neutral-100'
                }`}
              >
                {t(z.tagKey)}
              </span>
            </div>
          </SelectionCard>
        ))}
      </div>
      <NavButtons />
    </div>
  )

  const Step3 = () => (
    <div>
      <StepHeader titleKey="step3Title" subtitleKey="step3Subtitle" />
      <div className="bg-white border border-neutral-200 p-8">
        <label className="block text-xs font-bold uppercase tracking-[0.15em] text-neutral-500 mb-6">
          {t('sqmLabel')}
        </label>
        <div className="flex items-end gap-4 mb-8">
          <span className="text-fluid-2xl font-light text-neutral-800">{sqm}</span>
          <span className="text-sm text-neutral-400 pb-2">m²</span>
        </div>
        <input
          type="range"
          min={30}
          max={1000}
          step={5}
          value={sqm}
          onChange={e => setSqm(Number(e.target.value))}
          className="w-full h-1 bg-neutral-200 appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(180,168,152,0.2)]
            [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-primary
            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
        />
        <div className="flex justify-between text-xs text-neutral-400 mt-2">
          <span>30 m²</span>
          <span>1.000 m²</span>
        </div>
        {/* Direct input */}
        <div className="mt-6 flex items-center gap-3">
          <input
            type="number"
            min={30}
            max={1000}
            value={sqm}
            onChange={e => {
              const v = Math.max(30, Math.min(1000, Number(e.target.value) || 30))
              setSqm(v)
            }}
            className="w-24 px-3 py-2 text-sm border border-neutral-200 bg-white text-neutral-800 focus:border-primary focus:ring-0 outline-none transition-colors"
          />
          <span className="text-xs text-neutral-400">m²</span>
        </div>
      </div>
      <NavButtons />
    </div>
  )

  const Step4 = () => (
    <div>
      <StepHeader titleKey="step4Title" subtitleKey="step4Subtitle" />
      <div className="grid md:grid-cols-2 gap-3">
        {FINISH_LEVELS.map((fl, i) => (
          <SelectionCard key={fl.key} selected={finishLevel === i} onClick={() => { setFinishLevel(i); setTimeout(() => setStep(5), 300) }}>
            <p className="text-sm font-medium text-neutral-800 mb-1">{t(fl.key)}</p>
            <p className="text-xs font-bold text-primary mb-1">{t(fl.rangeKey)}</p>
            <p className="text-xs text-neutral-400">{t(fl.descKey)}</p>
          </SelectionCard>
        ))}
      </div>
      <NavButtons />
    </div>
  )

  const Step5 = () => (
    <div>
      <StepHeader titleKey="step5Title" subtitleKey="step5Subtitle" />
      <div className="space-y-3">
        {EXTRAS.map(ex => {
          const selected = extras.has(ex.key)
          return (
            <button
              key={ex.key}
              onClick={() => toggleExtra(ex.key)}
              className={`w-full text-left p-5 border transition-all duration-300 flex items-center justify-between ${
                selected
                  ? 'border-primary bg-primary/5'
                  : 'border-neutral-200 hover:border-primary/50 bg-white'
              }`}
            >
              <div>
                <p className="text-sm font-medium text-neutral-800">{t(ex.key)}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{t(ex.descKey)}</p>
              </div>
              <div
                className={`w-5 h-5 border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 ml-4 ${
                  selected ? 'border-primary bg-primary' : 'border-neutral-300'
                }`}
              >
                {selected && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <NavButtons />
    </div>
  )

  const ResultView = () => {
    const r = getResults()
    return (
      <div className="animate-fadeIn">
        <div className="text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary mb-3">
            {t('resultTitle')}
          </p>
          <h2 className="text-fluid-xl font-light uppercase tracking-wide text-neutral-800 mb-2">
            {t('totalRange')}
          </h2>
          <p className="text-neutral-500 text-sm mb-8">{t('resultSubtitle')}</p>

          {/* Big price range */}
          <div className="inline-block border border-primary/30 bg-primary/5 px-10 py-8">
            <p className="text-fluid-2xl font-light text-neutral-800 tracking-tight">
              {formatPrice(r.totalMin)}<span className="text-neutral-400 mx-3">—</span>{formatPrice(r.totalMax)}
            </p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="border border-neutral-200 bg-white p-6 md:p-8 mb-8">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-500 mb-6">
            {t('breakdown')}
          </h3>
          <div className="space-y-5">
            {r.breakdown.map(b => (
              <div key={b.key}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-neutral-700">{t(b.key)}</span>
                  <span className="text-sm text-neutral-500">
                    {formatPrice(b.min)} — {formatPrice(b.max)}
                  </span>
                </div>
                <div className="h-1 bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-1000 ease-out"
                    style={{ width: `${b.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-neutral-400 text-center mb-10 max-w-xl mx-auto leading-relaxed">
          {t('disclaimer')}
        </p>

        {/* CTA */}
        <div className="border border-primary/30 bg-[#F5F0EB] p-8 text-center">
          <h3 className="text-lg font-light uppercase tracking-wide text-neutral-800 mb-2">
            {t('ctaTitle')}
          </h3>
          <p className="text-sm text-neutral-600 mb-6">{t('ctaSubtitle')}</p>
          <Link
            href="/contacto"
            className="inline-block px-10 py-3.5 border border-neutral-800 text-neutral-800 text-xs font-bold uppercase tracking-[0.15em] hover:bg-[#5A5550] hover:text-white hover:border-[#5A5550] transition-all duration-500"
          >
            {t('ctaButton')}
          </Link>
        </div>

        {/* Reset button */}
        <div className="text-center mt-8">
          <button
            onClick={reset}
            className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-400 hover:text-primary transition-colors"
          >
            ← {t('recalculate')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEB_APP_SCHEMA) }}
      />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-white">
        <div className="max-w-3xl mx-auto px-6 text-center" data-animate="fade-up">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary mb-4">
            Cathedral Group
          </p>
          <h1 className="text-fluid-2xl font-light uppercase tracking-wide text-neutral-800 mb-4">
            {t('heroTitle')}
          </h1>
          <p className="text-neutral-500 max-w-xl mx-auto leading-relaxed">
            {t('heroSubtitle')}
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="pb-32 md:pb-24 bg-white">
        <div className="max-w-2xl mx-auto px-6">
          {!showResult && <ProgressBar />}

          <div className="min-h-[400px]">
            {showResult ? (
              <ResultView />
            ) : (
              <>
                {step === 1 && <Step1 />}
                {step === 2 && <Step2 />}
                {step === 3 && <Step3 />}
                {step === 4 && <Step4 />}
                {step === 5 && <Step5 />}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
