/**
 * Renderiza un string HTML a un PDF A4 multi-página usando Chrome headless.
 *
 * Por qué servidor y no `window.print()`: Safari imprime en blanco / sin A4 con
 * layouts flex+100vh (WebKit flexbugs). Generando el PDF en servidor el resultado
 * es idéntico en todos los navegadores.
 *
 * Producción (Vercel, Linux): usa el binario de @sparticuz/chromium.
 * Desarrollo local: usa el Chrome/Chromium instalado en el sistema.
 */
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

// Rutas típicas de Chrome para desarrollo local (el binario de @sparticuz solo corre en Linux/Lambda).
const LOCAL_CHROME: Record<string, string> = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const isDev = process.env.NODE_ENV !== 'production'
  const executablePath = isDev
    ? (process.env.CHROME_PATH || LOCAL_CHROME[process.platform] || LOCAL_CHROME.linux)
    : await chromium.executablePath()

  const browser = await puppeteer.launch({
    args: isDev ? [] : chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: true,
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    // Espera explícita a que carguen logo (URL absoluta) y la fuente Inter antes de paginar.
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete ? null : new Promise((res) => { img.onload = img.onerror = res })
        )
      )
      await document.fonts.ready
    })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
