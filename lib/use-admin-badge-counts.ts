'use client'

/**
 * useAdminBadgeCounts — fuente única de contadores para los badges del panel.
 *
 * Extraído del useEffect que vivía en AdminSidebar para que TANTO la barra
 * superior (AdminTopBar, badges-resumen por zona) COMO el rail contextual
 * (AdminSidebar, badges por item) lean los mismos números sin duplicar lógica.
 *
 * Las queries son las MISMAS que antes (mismas tablas, mismos filtros). No se
 * añaden contadores nuevos: per-doc-type no tiene fuente de conteo hoy.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export interface AdminBadgeCounts {
  revisionCount: number | null
  errorCount: number | null
  orphanCount: number | null
  notifCritical: number | null
  notifWarning: number | null
  absencesPending: number | null
  ticketsPending: number | null
  expensesPending: number | null
  partesAnomalia: number | null
  agentDiagnosesPending: number | null
}

export function useAdminBadgeCounts(): AdminBadgeCounts {
  const [revisionCount, setRevisionCount] = useState<number | null>(null)
  const [errorCount, setErrorCount] = useState<number | null>(null)
  const [orphanCount, setOrphanCount] = useState<number | null>(null)
  const [notifCritical, setNotifCritical] = useState<number | null>(null)
  const [notifWarning, setNotifWarning] = useState<number | null>(null)
  const [absencesPending, setAbsencesPending] = useState<number | null>(null)
  const [ticketsPending, setTicketsPending] = useState<number | null>(null)
  const [expensesPending, setExpensesPending] = useState<number | null>(null)
  const [partesAnomalia, setPartesAnomalia] = useState<number | null>(null)
  const [agentDiagnosesPending, setAgentDiagnosesPending] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient()
    // Revisión IA: needs_review pendiente
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('needs_review', true)
      .eq('review_status', 'pendiente')
      .is('deleted_at', null)
      .then(({ count }) => { if (count !== null) setRevisionCount(count) })
    // Errores del workflow: review_status='error' (placeholder de procesado fallido)
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('review_status', 'error')
      .is('deleted_at', null)
      .then(({ count }) => { if (count !== null) setErrorCount(count) })
    // Huérfanos persistentes: emails detectados que el cron auditor no pudo
    // reprocesar. Tolera ausencia de tabla (migración pendiente) → null silencioso.
    supabase
      .from('email_audit_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'persistent_orphan')
      .then(({ count, error: err }) => {
        if (!err && count !== null) setOrphanCount(count)
      })
    // Notificaciones críticas/warnings activas (sistema notificaciones internas).
    // Excluir las que están snoozed (snoozed_until > NOW).
    const nowIso = new Date().toISOString()
    supabase
      .from('system_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('severity', 'critical')
      .is('dismissed_at', null)
      .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`)
      .then(({ count, error: err }) => {
        if (!err && count !== null) setNotifCritical(count)
      })
    supabase
      .from('system_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('severity', 'warning')
      .is('dismissed_at', null)
      .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`)
      .then(({ count, error: err }) => {
        if (!err && count !== null) setNotifWarning(count)
      })
    // Personal: pendientes accionables
    supabase
      .from('worker_absences')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .is('deleted_at', null)
      .then(({ count, error: err }) => {
        if (!err && count !== null) setAbsencesPending(count)
      })
    supabase
      .from('worker_attachments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['uploaded', 'processing', 'extracted'])
      .is('deleted_at', null)
      .then(({ count, error: err }) => {
        if (!err && count !== null) setTicketsPending(count)
      })
    supabase
      .from('worker_expense_items')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .is('deleted_at', null)
      .then(({ count, error: err }) => {
        if (!err && count !== null) setExpensesPending(count)
      })
    // Agentes IA: diagnósticos pendientes Op 2
    supabase
      .from('agent_diagnoses')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('is_test', false)
      .then(({ count, error: err }) => {
        if (!err && count !== null) setAgentDiagnosesPending(count)
      })
    // Partes con geofence anómalo en últimos 7 días
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    supabase
      .from('time_records')
      .select('id', { count: 'exact', head: true })
      .gte('fecha', sevenDaysAgo)
      .is('deleted_at', null)
      .or('entrada_geofence_status.eq.outside,entrada_geofence_status.eq.low_accuracy,salida_geofence_status.eq.outside,salida_geofence_status.eq.low_accuracy')
      .then(({ count, error: err }) => {
        if (!err && count !== null) setPartesAnomalia(count)
      })
  }, [])

  return {
    revisionCount,
    errorCount,
    orphanCount,
    notifCritical,
    notifWarning,
    absencesPending,
    ticketsPending,
    expensesPending,
    partesAnomalia,
    agentDiagnosesPending,
  }
}
