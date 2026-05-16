#!/usr/bin/env node
/**
 * node --test scripts/test-api-auth.mjs
 *
 * Tests unitarios `lib/api-auth.ts:checkCathedralInternalAuth`.
 * Replica lógica en JS puro para validar comportamiento sin tocar prod.
 *
 * Si lib cambia algoritmo, sincronizar aquí.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timingSafeEqual } from 'node:crypto'

// Token de TEST fake (64 hex chars, NO el real producción).
// Real token Cathedral en env CATHEDRAL_INTERNAL_TOKEN — NUNCA hardcoded.
const EXPECTED_TOKEN = 'a'.repeat(64)

function checkAuth(authHeader, expectedToken) {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const expected = (expectedToken ?? '').trim()
  if (!token || !expected) return false
  if (token.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}

test('valid Bearer token returns true', () => {
  assert.equal(checkAuth(`Bearer ${EXPECTED_TOKEN}`, EXPECTED_TOKEN), true)
})

test('valid Bearer with trailing whitespace returns true', () => {
  assert.equal(checkAuth(`Bearer ${EXPECTED_TOKEN}  `, EXPECTED_TOKEN), true)
})

test('case-insensitive Bearer prefix accepted', () => {
  assert.equal(checkAuth(`bearer ${EXPECTED_TOKEN}`, EXPECTED_TOKEN), true)
  assert.equal(checkAuth(`BEARER ${EXPECTED_TOKEN}`, EXPECTED_TOKEN), true)
})

test('empty Authorization header returns false', () => {
  assert.equal(checkAuth('', EXPECTED_TOKEN), false)
})

test('Bearer without token returns false', () => {
  assert.equal(checkAuth('Bearer ', EXPECTED_TOKEN), false)
})

test('wrong token returns false', () => {
  assert.equal(checkAuth('Bearer wrong-token-here-' + 'x'.repeat(40), EXPECTED_TOKEN), false)
})

test('token differs in length returns false (no timingSafeEqual throw)', () => {
  assert.equal(checkAuth('Bearer too-short', EXPECTED_TOKEN), false)
})

test('token differs same length returns false (timingSafeEqual compares)', () => {
  // 64 chars exactly, all zeros
  const wrongSameLength = '0'.repeat(64)
  assert.equal(checkAuth(`Bearer ${wrongSameLength}`, EXPECTED_TOKEN), false)
})

test('expected token empty/null returns false', () => {
  assert.equal(checkAuth(`Bearer ${EXPECTED_TOKEN}`, ''), false)
  assert.equal(checkAuth(`Bearer ${EXPECTED_TOKEN}`, null), false)
  assert.equal(checkAuth(`Bearer ${EXPECTED_TOKEN}`, undefined), false)
})

test('no Bearer prefix still extracts and compares', () => {
  // checkAuth solo replaces si match — sin prefijo, token completo
  // queda como toda la string. Si la string es exactamente el token,
  // la length sería igual + match. Esto es behavior aceptable: alguien
  // que pone solo el token sin "Bearer " no debería ser denegado por
  // diferencia formato HTTP, pero el handler ya extrae de
  // request.headers.get('Authorization') que típicamente incluye prefijo.
  assert.equal(checkAuth(EXPECTED_TOKEN, EXPECTED_TOKEN), true)
})

test('SQL injection attempts in token blocked (length check)', () => {
  // SQL injection no aplica via timingSafeEqual (no string concat), pero
  // length differ → false return rápido.
  assert.equal(
    checkAuth("Bearer ' OR 1=1 --", EXPECTED_TOKEN),
    false
  )
})

test('unicode token characters length differs blocked', () => {
  // Token Cathedral es hex 64 chars ASCII. Unicode chars cambia byte length
  // vs char length → diferente buffer size → length check catch.
  assert.equal(checkAuth('Bearer ' + 'a'.repeat(63) + 'ñ', EXPECTED_TOKEN), false)
})
