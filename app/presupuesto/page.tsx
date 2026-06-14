'use client'

import { useState, useCallback, useEffect } from 'react'
import { useT } from '@/lib/translations'
import { DEFAULT_CONFIG, computeEstimate, visibleExtras, type PricingConfig, type Extra } from '@/lib/pricing'

/* ── Schema.org WebApplication (injected once) ── */
const WEB_APP_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Calculadora de Presupuesto de Reforma | Cathedral Group',
  url: 'https://cathedralgroup.es/presupuesto',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  description:
    'Calculadora interactiva para estimar el presupuesto de una reforma de alto standing en Madrid.',
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

// Iconos de los tipos de proyecto (solo UI). Los datos de precio viven en lib/pricing.ts.
const PROJECT_ICONS: Record<string, string> = {
  reformaIntegral: '◻',
  reformaParcial: '▣',
  interiorismo: '◈',
  cambioUso: '⬡',
  obraNueva: '△',
  promocion: '▦',
}

/* ── Helpers ── */
function formatPrice(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

/* ── Captura de lead en el resultado ──
   Componente a nivel de módulo (NO anidado en PresupuestoPage): los componentes
   anidados se recrean en cada render del padre y React los desmonta/remonta,
   perdiendo el foco del input en cada pulsación. */
function CalculatorLeadForm({
  tipoProyecto,
  zona,
  sqm,
  rango,
  detalle,
  bare = false,
}: {
  tipoProyecto: string
  zona: string
  sqm: number
  rango: string
  detalle: string
  bare?: boolean
}) {
  const t = useT('calculator')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [empresaWeb, setEmpresaWeb] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          email,
          telefono: telefono.replace(/\s/g, ''),
          tipo_proyecto: tipoProyecto,
          zona,
          metros_cuadrados: sqm,
          presupuesto_rango: rango,
          mensaje: detalle,
          empresa_web: empresaWeb,
          source_page: '/presupuesto',
        }),
      })
      setStatus(res.ok ? 'ok' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'ok') {
    return (
      <div className={bare ? 'text-center px-6' : 'border border-primary/30 bg-white p-8 text-center'}>
        <div className="w-12 h-12 mx-auto mb-4 border-2 border-primary flex items-center justify-center">
          <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-light uppercase tracking-wide text-neutral-800 mb-2">
          {t('leadSuccessTitle')}
        </h3>
        <p className="text-sm text-neutral-600">{t('leadSuccessText')}</p>
      </div>
    )
  }

  const inputClass =
    'w-full bg-white border border-neutral-300 focus:border-primary focus:ring-1 focus:ring-primary p-3.5 text-sm text-neutral-900 placeholder:text-neutral-400'

  return (
    <div className={bare ? 'px-6' : 'border border-primary/30 bg-white p-8'}>
      <div className="text-center mb-6">
        <h3 className="text-lg font-light uppercase tracking-wide text-neutral-800 mb-2">
          {t('ctaTitle')}
        </h3>
        <p className="text-sm text-neutral-600">{t('leadSubtitle')}</p>
      </div>
      <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-3">
        <input
          type="text"
          required
          minLength={2}
          maxLength={100}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t('leadName')}
          className={inputClass}
          autoComplete="name"
        />
        <input
          type="email"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('leadEmail')}
          className={inputClass}
          autoComplete="email"
        />
        <input
          type="tel"
          maxLength={20}
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder={t('leadPhone')}
          className={inputClass}
          autoComplete="tel"
        />
        {/* Honeypot anti-spam: oculto para humanos, los bots lo rellenan */}
        <input
          type="text"
          name="empresa_web"
          value={empresaWeb}
          onChange={(e) => setEmpresaWeb(e.target.value)}
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
        {status === 'error' && (
          <p className="text-xs text-red-600 text-center" role="alert">
            {t('leadError')}
          </p>
        )}
        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full px-10 py-3.5 border border-neutral-800 text-neutral-800 text-xs font-bold uppercase tracking-[0.15em] hover:bg-[#5A5550] hover:text-white hover:border-[#5A5550] transition-all duration-500 disabled:opacity-50 disabled:cursor-wait"
        >
          {status === 'sending' ? t('leadSending') : t('ctaButton')}
        </button>
      </form>
    </div>
  )
}

/* ── Component ── */
export default function PresupuestoPage() {
  const t = useT('calculator')

  /* Los botones de navegación van en flujo bajo cada paso (no barra fija),
     así que el botón de WhatsApp ya no necesita desplazarse */

  /* state */
  const [step, setStep] = useState(1)
  const [projectType, setProjectType] = useState<string | null>(null)
  const [zone, setZone] = useState<number | null>(null)
  const [sqm, setSqm] = useState(120)
  const [sqmText, setSqmText] = useState('120')
  const [finishLevel, setFinishLevel] = useState<number | null>(null)
  const [extras, setExtras] = useState<Set<string>>(new Set())
  const [showResult, setShowResult] = useState(false)
  const [isProtected, setIsProtected] = useState(false)
  const [showHouseExtras, setShowHouseExtras] = useState(false)

  const toggleExtra = useCallback((key: string) => {
    setExtras(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  /* Precios/gating: la BD es la fuente única (tabla pricing_config, editable en el
     panel). Se lee una vez; si falla o la tabla no existe, queda DEFAULT_CONFIG
     (= las constantes del código) → la calculadora nunca se rompe. */
  const [config, setConfig] = useState<PricingConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    let alive = true
    fetch('/api/pricing')
      .then(r => (r.ok ? r.json() : null))
      .then((cfg: PricingConfig | null) => {
        if (alive && cfg && Array.isArray(cfg.levels) && cfg.levels.length) setConfig(cfg)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  /* Si cambia el nivel/tipo (o la config), deselecciona los extras que ya no son
     visibles en esa gama (p.ej. bajar de Premium a Económica quita spa/gimnasio). */
  useEffect(() => {
    const visibleKeys = new Set(
      visibleExtras(config, {
        levelIdx: finishLevel ?? 1,
        projectKey: projectType ?? 'reformaIntegral',
        showHouse: true,
      }).map(e => e.key)
    )
    setExtras(prev => {
      let changed = false
      const next = new Set<string>()
      for (const k of prev) {
        if (visibleKeys.has(k)) next.add(k)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [finishLevel, projectType, config])

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

  const getResults = () =>
    computeEstimate(
      {
        levelIdx: finishLevel ?? 1,
        projectKey: projectType ?? 'reformaIntegral',
        zoneIdx: zone ?? config.zones.length - 1,
        sqm,
        extraKeys: [...extras],
        isProtected,
      },
      config
    )

  const reset = () => {
    setStep(1)
    setProjectType(null)
    setZone(null)
    setSqm(120)
    setFinishLevel(null)
    setExtras(new Set())
    setShowResult(false)
    setIsProtected(false)
    setShowHouseExtras(false)
  }

  /* ── Render helpers ── */
  const ProgressBar = () => (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div key={i} className="flex items-center gap-2 flex-1">
          <div
            className={`h-1 flex-1 transition-all duration-500 ${
              i < step ? 'bg-primary' : 'bg-white'
            }`}
          />
        </div>
      ))}
    </div>
  )

  const StepHeader = ({ titleKey, subtitleKey }: { titleKey: string; subtitleKey: string }) => (
    <div className="mb-5">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary mb-3">
        {t('step')} {step} {t('of')} {TOTAL_STEPS}
      </p>
      <h2 className="text-fluid-xl font-light uppercase tracking-wide text-neutral-800 mb-2">
        {t(titleKey)}
      </h2>
      <p className="text-neutral-500 text-sm">{t(subtitleKey)}</p>
    </div>
  )

  // Solo los pasos sin elección única (m² y extras) muestran botón de avance.
  // Los de elección única (tipo, zona, nivel) avanzan al pulsar la opción.
  const NavButtons = ({ withNext = false }: { withNext?: boolean }) => (
    <div className="mt-10 pt-6 border-t border-neutral-200 flex items-center justify-between">
      <button
        onClick={goPrev}
        className={`px-6 py-3 text-xs font-bold uppercase tracking-[0.15em] bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100 transition-all duration-300 ${
          step === 1 && !showResult ? 'invisible' : ''
        }`}
      >
        ← {t('prev')}
      </button>
      {withNext && (
        <button
          onClick={goNext}
          disabled={!canAdvance()}
          className={`px-10 py-3.5 text-xs font-bold uppercase tracking-[0.15em] transition-all duration-500 ${
            canAdvance()
              ? 'bg-[#5A5550] text-white hover:bg-[#4A4540]'
              : 'bg-white text-neutral-400 border border-neutral-200 cursor-not-allowed'
          }`}
        >
          {step === TOTAL_STEPS ? t('calculate') : t('next')} →
        </button>
      )}
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
      className={`w-full text-left p-8 border transition-all duration-300 group ${
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
      <div className="grid md:grid-cols-3 gap-6">
        {config.projectTypes.map((pt) => (
          <SelectionCard
            key={pt.key}
            selected={projectType === pt.key}
            onClick={() => { setProjectType(pt.key); pt.isCustom ? setShowResult(true) : setStep(2) }}
          >
            <div className="flex items-center gap-4">
              <span className="text-2xl text-primary opacity-60">{PROJECT_ICONS[pt.key]}</span>
              <div>
                <p className="text-sm font-medium text-neutral-800">{t(pt.key)}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{t(`${pt.key}Desc`)}</p>
              </div>
            </div>
          </SelectionCard>
        ))}
      </div>
    </div>
  )

  const Step2 = () => (
    <div>
      <StepHeader titleKey="step2Title" subtitleKey="step2Subtitle" />
      <div className="space-y-3">
        {config.zones.map((z, i) => (
          <SelectionCard key={z.key} selected={zone === i} onClick={() => { setZone(i); setStep(3) }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-neutral-800">{t(z.key)}</p>
              <span
                className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 ${
                  z.multiplier > 1
                    ? 'text-primary bg-primary/10'
                    : 'text-neutral-500 bg-neutral-100'
                }`}
              >
                {t(`${z.key}Tag`)}
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
          step={1}
          value={sqm}
          onChange={e => {
            const v = Number(e.target.value)
            setSqm(v)
            setSqmText(String(v))
          }}
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
            type="text"
            inputMode="numeric"
            pattern="\d*"
            value={sqmText}
            onChange={e => {
              const raw = e.target.value.replace(/[^\d]/g, '')
              setSqmText(raw)
              const n = Number(raw)
              if (raw !== '' && n >= 30 && n <= 1000) setSqm(n)
            }}
            onBlur={() => {
              const n = Number(sqmText)
              const clamped =
                sqmText === '' || !Number.isFinite(n) ? 30 : Math.max(30, Math.min(1000, n))
              setSqm(clamped)
              setSqmText(String(clamped))
            }}
            className="w-24 px-3 py-2 text-sm border border-neutral-200 bg-white text-neutral-800 focus:border-primary focus:ring-0 outline-none transition-colors"
          />
          <span className="text-xs text-neutral-400">m²</span>
        </div>
      </div>

      {/* Casilla opcional: edificio protegido/señorial (sobrecoste real ×1,3) */}
      <button
        type="button"
        onClick={() => setIsProtected((v) => !v)}
        className={`w-full text-left mt-4 p-6 border transition-all duration-300 flex items-center justify-between ${
          isProtected ? 'border-primary bg-primary/5' : 'border-neutral-200 hover:border-primary/50 bg-white'
        }`}
      >
        <div>
          <p className="text-sm font-medium text-neutral-800">{t('protectedLabel')}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{t('protectedDesc')}</p>
        </div>
        <div
          className={`w-5 h-5 border-2 flex items-center justify-center transition-all duration-300 shrink-0 ml-4 ${
            isProtected ? 'border-primary bg-primary' : 'border-neutral-300'
          }`}
        >
          {isProtected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </button>

      <NavButtons withNext />
    </div>
  )

  const Step4 = () => (
    <div>
      <StepHeader titleKey="step4Title" subtitleKey="step4Subtitle" />
      <div className="grid md:grid-cols-2 gap-3">
        {config.levels.map((lvl, i) => (
          <SelectionCard key={lvl.key} selected={finishLevel === i} onClick={() => { setFinishLevel(i); lvl.isContact ? setShowResult(true) : setStep(5) }}>
            <p className="text-sm font-medium text-neutral-800 mb-1">{t(lvl.key)}</p>
            <p className="text-xs font-bold text-primary mb-1">{t(`${lvl.key}Range`)}</p>
            <p className="text-xs text-neutral-400">{t(`${lvl.key}Desc`)}</p>
          </SelectionCard>
        ))}
      </div>
      <NavButtons />
    </div>
  )

  // Render de una fila de extra (núcleo y casa comparten el mismo aspecto).
  const ExtraRow = (ex: Extra) => {
    const selected = extras.has(ex.key)
    return (
      <button
        key={ex.key}
        type="button"
        onClick={() => toggleExtra(ex.key)}
        className={`w-full text-left p-6 border transition-all duration-300 flex items-center justify-between ${
          selected ? 'border-primary bg-primary/5' : 'border-neutral-200 hover:border-primary/50 bg-white'
        }`}
      >
        <div>
          <p className="text-sm font-medium text-neutral-800">{t(ex.key)}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{t(`${ex.key}Desc`)}</p>
        </div>
        <div
          className={`w-5 h-5 border-2 flex items-center justify-center transition-all duration-300 shrink-0 ml-4 ${
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
  }

  const Step5 = () => {
    // Extras visibles según la gama (nivel), el tipo y el ámbito. coreVisible
    // (piso) siempre; houseVisible (chalet) en sección desplegable, solo si la
    // gama los permite (p.ej. interiorismo o económica sin lujo no los muestran).
    const allVisible = visibleExtras(config, {
      levelIdx: finishLevel ?? 1,
      projectKey: projectType ?? 'reformaIntegral',
      showHouse: true,
    })
    const coreVisible = allVisible.filter((e) => e.scope === 'all')
    const houseVisible = allVisible.filter((e) => e.scope === 'house')
    return (
      <div>
        <StepHeader titleKey="step5Title" subtitleKey="step5Subtitle" />
        <div className="space-y-3">{coreVisible.map(ExtraRow)}</div>

        {/* Extras de vivienda unifamiliar / chalet — solo si la gama los permite */}
        {houseVisible.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowHouseExtras((v) => !v)}
              className="mt-5 mb-1 text-xs font-bold uppercase tracking-[0.15em] text-primary hover:text-[#4A4540] transition-colors"
            >
              {showHouseExtras ? '−' : '+'} {t('extrasHouseToggle')}
            </button>
            {showHouseExtras && <div className="space-y-3 mt-3">{houseVisible.map(ExtraRow)}</div>}
          </>
        )}

        <NavButtons withNext />
      </div>
    )
  }

  // Promoción/Desarrollo no se estima por m² (varía mucho): en vez de un número,
  // se muestra una vista de "presupuesto a medida" que capta el lead para estudio.
  // Se invoca como CustomQuoteView() (no <CustomQuoteView/>), igual que ResultView,
  // para no remontar y que CalculatorLeadForm no pierda foco/estado.
  const CustomQuoteView = ({
    labelKey,
    titleKey,
    textKey,
    tipoProyecto,
    detalle,
  }: {
    labelKey: string
    titleKey: string
    textKey: string
    tipoProyecto: string
    detalle: string
  }) => (
    <div className="animate-fadeIn">
      <div className="text-center mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary mb-3">
          {t(labelKey)}
        </p>
        <h2 className="text-fluid-xl font-light uppercase tracking-wide text-neutral-800 mb-3">
          {t(titleKey)}
        </h2>
        <p className="text-neutral-500 text-sm max-w-xl mx-auto leading-relaxed">
          {t(textKey)}
        </p>
      </div>

      {/* Recuadro blanco a sangre (de lado a lado): rompe el padding de la banda
          para partir el beige en dos franjas, con el formulario centrado dentro. */}
      <div className="-mx-6 md:-mx-10 border-y border-primary/30 bg-white py-12">
        <CalculatorLeadForm
          tipoProyecto={tipoProyecto}
          zona={zone !== null ? t(config.zones[zone].key) : ''}
          sqm={0}
          rango="A medida"
          detalle={detalle}
          bare
        />
      </div>

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

        {/* Captura de lead con el contexto de la estimación */}
        <CalculatorLeadForm
          tipoProyecto={projectType ? t(projectType) : ''}
          zona={zone !== null ? t(config.zones[zone].key) : ''}
          sqm={sqm}
          rango={`${formatPrice(r.totalMin)} - ${formatPrice(r.totalMax)}`}
          detalle={[
            'Lead calculadora de presupuesto',
            projectType ? t(projectType) : null,
            zone !== null ? t(config.zones[zone].key) : null,
            `${sqm} m²`,
            finishLevel !== null ? t(config.levels[finishLevel].key) : null,
            extras.size > 0 ? `Extras: ${[...extras].map((k) => t(k)).join(', ')}` : null,
            `Estimación: ${formatPrice(r.totalMin)} - ${formatPrice(r.totalMax)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        />

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

      {/* Hero — blanco y centrado. Sin eyebrow; título en una línea y al mismo
          tamaño que "Inicie su proyecto" (text-2xl md:text-3xl); explicación debajo. */}
      <section className="pt-16 pb-12 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center" data-animate="fade-up">
          <h1 className="text-2xl md:text-3xl font-light uppercase tracking-wide text-neutral-800 mb-3 md:whitespace-nowrap">
            {t('heroTitle')}
          </h1>
          <p className="text-neutral-500 max-w-xl mx-auto leading-relaxed">
            {t('heroSubtitle')}
          </p>
        </div>
      </section>

      {/* Calculadora — banda beige a todo el ancho, centrada (mismo criterio que
          el contacto de las divisiones). Las tarjetas blancas del wizard
          contrastan sobre el beige y la sección llena la pantalla. */}
      <section className="pt-6 pb-12 bg-beige-subtle">
        <div className="px-6 md:px-10">
          {!showResult && <ProgressBar />}

          <div className="min-h-0">
            {/* ResultView() como llamada (no <ResultView />): al ser función anidada,
                montarla como componente la remontaría en cada render del padre y
                CalculatorLeadForm perdería estado/foco. Como llamada es JSX inline. */}
            {showResult ? (
              projectType === 'promocion'
                ? CustomQuoteView({
                    labelKey: 'promocion',
                    titleKey: 'customTitle',
                    textKey: 'customText',
                    tipoProyecto: t('promocion'),
                    detalle: 'Lead promoción/desarrollo — presupuesto a medida (no estimable por m²)',
                  })
                : finishLevel !== null && config.levels[finishLevel]?.isContact
                  ? CustomQuoteView({
                      labelKey: 'excepcional',
                      titleKey: 'excepcionalTitle',
                      textKey: 'excepcionalText',
                      tipoProyecto: `${projectType ? t(projectType) : ''} · ${t('excepcional')}`,
                      detalle: [
                        'Lead calculadora — nivel Excepcional (a medida)',
                        projectType ? t(projectType) : null,
                        zone !== null ? t(config.zones[zone].key) : null,
                        `${sqm} m²`,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                    })
                  : ResultView()
            ) : (
              <>
                {step === 1 && Step1()}
                {step === 2 && Step2()}
                {step === 3 && Step3()}
                {step === 4 && Step4()}
                {step === 5 && Step5()}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
