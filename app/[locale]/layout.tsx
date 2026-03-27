import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/lib/i18n/routing'
import { Manrope } from 'next/font/google'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import WhatsAppFloat from '@/components/layout/WhatsAppFloat'
import SmoothScroll from '@/components/animations/SmoothScroll'
import ScrollAnimations from '@/components/animations/ScrollAnimations'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!routing.locales.includes(locale as any)) {
    notFound()
  }

  const messages = await getMessages()

  return (
    <html lang={locale} className={manrope.variable}>
      <body className="font-display text-neutral-900 antialiased">
        <NextIntlClientProvider messages={messages}>
          <Header />
          <main className="pt-20">
            {children}
          </main>
          <Footer />
          <WhatsAppFloat />
          <SmoothScroll />
          <ScrollAnimations />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
