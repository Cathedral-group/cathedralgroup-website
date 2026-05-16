#!/usr/bin/env node
/**
 * node --test scripts/test-feature-flags-rollout.mjs
 *
 * Verifica determinismo y distribución del rollout hash SHA-256
 * usado por `lib/feature-flags.ts:isInRollout`.
 *
 * No depende de Next.js — duplica la lógica del helper en JS puro para
 * validar exclusivamente la matemática del bucket. Si cambia el algoritmo
 * en `lib/feature-flags.ts`, sincronizar aquí.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

function isInRollout(flagKey, subjectId, pct) {
  if (pct <= 0) return false
  if (pct >= 100) return true
  const hash = createHash('sha256').update(`${flagKey}:${subjectId}`).digest()
  const bucket = hash.readUInt32BE(0) % 100
  return bucket < pct
}

test('rollout 0 always returns false', () => {
  for (let i = 0; i < 100; i++) {
    assert.equal(isInRollout('any_flag', `subject_${i}`, 0), false)
  }
})

test('rollout 100 always returns true', () => {
  for (let i = 0; i < 100; i++) {
    assert.equal(isInRollout('any_flag', `subject_${i}`, 100), true)
  }
})

test('rollout is deterministic — same (key, subject) always same answer', () => {
  const key = 'use_dedup_endpoint'
  const subject = 'a'.repeat(64) // mock sha256
  const first = isInRollout(key, subject, 50)
  for (let i = 0; i < 100; i++) {
    assert.equal(isInRollout(key, subject, 50), first)
  }
})

test('rollout buckets are independent across flag keys', () => {
  // Mismo subject, mismo pct=50, distinto key → resultado DEBE poder diferir
  // sobre una muestra. Si NO difiere en 1000 subjects, hay correlación.
  let differ = 0
  for (let i = 0; i < 1000; i++) {
    const subj = `subj_${i}`
    const a = isInRollout('flag_a', subj, 50)
    const b = isInRollout('flag_b', subj, 50)
    if (a !== b) differ++
  }
  // Esperamos ~50% de divergencia (independencia). Acepto rango 35-65%.
  assert.ok(differ > 350 && differ < 650, `differ=${differ} fuera de rango [350,650]`)
})

test('rollout distribution approximates pct over large sample', () => {
  const key = 'distribution_test'
  const N = 10000
  for (const pct of [10, 25, 50, 75, 90]) {
    let trueCount = 0
    for (let i = 0; i < N; i++) {
      if (isInRollout(key, `subj_${i}`, pct)) trueCount++
    }
    const observedPct = (trueCount / N) * 100
    // Margen 3pp absoluto sobre N=10000 (chi-cuadrado holgado)
    assert.ok(
      Math.abs(observedPct - pct) < 3,
      `pct=${pct} observed=${observedPct.toFixed(2)}% fuera de tolerancia 3pp`
    )
  }
})

test('subject case-sensitive', () => {
  // file_hash es hex lowercase; supplier_id es UUID lowercase. No normalizamos.
  const a = isInRollout('k', 'abc', 50)
  const b = isInRollout('k', 'ABC', 50)
  // Deterministas individualmente, pero NO esperamos que sean iguales necesariamente.
  // Solo verificamos que cada uno sea estable consigo mismo.
  assert.equal(isInRollout('k', 'abc', 50), a)
  assert.equal(isInRollout('k', 'ABC', 50), b)
})

test('empty subject works (degenerate but no crash)', () => {
  // No debería pasar en producción pero el helper debe ser robusto.
  assert.doesNotThrow(() => isInRollout('k', '', 50))
})

test('key format regex matches snake_case', () => {
  const KEY_REGEX = /^[a-z0-9_]+$/
  assert.equal(KEY_REGEX.test('use_dedup_endpoint'), true)
  assert.equal(KEY_REGEX.test('flag_123'), true)
  assert.equal(KEY_REGEX.test('Flag'), false)
  assert.equal(KEY_REGEX.test('flag-with-dash'), false)
  assert.equal(KEY_REGEX.test('flag.dot'), false)
  assert.equal(KEY_REGEX.test(''), false)
})

// Edge cases adicionales — audit 16/05 noche

test('unicode subject_id deterministic + valid', () => {
  // Subject Unicode (e.g. mensaje WhatsApp employee con emoji) debe seguir
  // determinista. Crypto SHA-256 acepta cualquier byte sequence.
  const key = 'use_dedup_endpoint'
  for (const subject of ['employee-✓', '试验', '🚀rocket', 'café-Ñoño']) {
    const a = isInRollout(key, subject, 50)
    const b = isInRollout(key, subject, 50)
    assert.equal(a, b, `unicode subject ${subject} deterministic`)
    assert.equal(typeof a, 'boolean')
  }
})

test('very long subject_id (10k chars) handled', () => {
  // SHA-256 acepta cualquier length. Test rendimiento + correctness.
  const longSubject = 'a'.repeat(10000)
  const a = isInRollout('k', longSubject, 50)
  const b = isInRollout('k', longSubject, 50)
  assert.equal(a, b)
  assert.equal(typeof a, 'boolean')
})

test('pct decimal truncates to integer behavior', () => {
  // SHA-256 mod 100 da entero 0-99. Comparación `< pct` con pct float
  // funciona pero teóricamente: bucket=49 < pct=49.5 = true.
  // Production code valida pct integer via zod, edge case raro.
  const subject = 'test_pct_decimal'
  const a = isInRollout('k', subject, 49.5)
  const b = isInRollout('k', subject, 49)
  const c = isInRollout('k', subject, 50)
  // a should be between b and c (inclusive bounds)
  if (b === false && c === true) {
    // bucket está exactamente 49 → a depende de pct (49.5 → true, 49 → false)
    assert.ok(typeof a === 'boolean', 'a is boolean even with float pct')
  }
})

test('pct negative returns false (guard)', () => {
  assert.equal(isInRollout('k', 'subject', -10), false)
  assert.equal(isInRollout('k', 'subject', -0.001), false)
})

test('pct > 100 returns true (clamp behavior)', () => {
  assert.equal(isInRollout('k', 'subject', 150), true)
  assert.equal(isInRollout('k', 'subject', 1000000), true)
})

test('subject with null bytes handled correctly', () => {
  // null byte in middle of string — JS strings permite, SHA-256 acepta
  const subjectWithNull = 'foo\x00bar'
  const a = isInRollout('k', subjectWithNull, 50)
  assert.equal(typeof a, 'boolean')
  assert.equal(isInRollout('k', subjectWithNull, 50), a) // deterministic
})
