#!/usr/bin/env node
/**
 * Genera un par de claves VAPID para Web Push.
 *
 * Uso (UNA VEZ en la vida del proyecto):
 *   node scripts/generate-vapid-keys.js
 *
 * Después:
 *   - Añadir VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT a Vercel env vars
 *     (Project Settings → Environment Variables) en Production + Preview
 *   - Redeploy para que el server las recoja
 *   - El botón "🔔 Activar notificaciones push" del dashboard admin se habilita
 *
 * Las claves NUNCA cambian salvo que quieras invalidar TODAS las suscripciones
 * existentes (forzar a todos los admins a re-suscribirse desde 0).
 */

const webpush = require('web-push')

const { publicKey, privateKey } = webpush.generateVAPIDKeys()

console.log('\nVAPID keys generadas. Añade estas tres variables a Vercel env:\n')
console.log('VAPID_PUBLIC_KEY=' + publicKey)
console.log('VAPID_PRIVATE_KEY=' + privateKey)
console.log('VAPID_SUBJECT=mailto:d.vieco@cathedralgroup.es')
console.log('\nIMPORTANTE: la PRIVATE KEY NUNCA debe ir al cliente ni a un repo público.')
console.log('Solo en Vercel env, sin commit.\n')
