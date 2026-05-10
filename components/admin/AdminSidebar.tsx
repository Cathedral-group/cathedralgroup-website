'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import ActiveCompanyBadge from './ActiveCompanyBadge'

/* ── Types ── */
type NavItem = {
  label: string
  href: string
  icon?: React.ReactNode
  description?: string      // texto pequeño debajo del label para conceptos técnicos
  children?: NavItem[]      // sub-items para drill-down
  badge?: 'red' | 'amber' | 'blue'  // color del badge contador (si lo tiene)
  badgeKey?: 'errors' | 'review' | 'orphans' | 'notif_critical' | 'notif_warning'    // qué counter mostrar
  countKey?: string         // si los hijos tienen contadores dinámicos, key para resolverlos
}
type NavSection = {
  label: string
  items: NavItem[]
}

/* ── SVG Icons ── */
function IconDashboard() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
}
function IconLeads() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" /></svg>
}
function IconClientes() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
}
function IconProyectos() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
}
function IconPresupuestos() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
}
function IconFacturas() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
}
function IconInformes() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
}
function IconProveedores() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
}
function IconEscrituras() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" /></svg>
}
function IconContratos() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>
}
function IconLicencias() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h3.75a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.92-.715-.92-.715s-.394-.056-.677-.244M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664M3 14.25v.75A2.25 2.25 0 005.25 17.25h.75m-3-3V7.5A2.25 2.25 0 015.25 5.25h.75m-3 9V14.25m3-9.75H3m3 0V3m0 1.5v.75" /></svg>
}
function IconSeguros() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
}
function IconFiscal() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" /></svg>
}
function IconLaboral() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg>
}
function IconFlota() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
}
function IconCorporativo() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
}
function IconRevision() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
}
function IconPapelera() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
}
function IconConfiguracion() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
}
function IconOperaciones() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>
}
function IconArchivo() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
}
function IconSistema() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>
}
function IconForensic() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" /></svg>
}
function IconEval() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
}
function IconPersonal() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
}

/* ── Navigation structure ──
   Items con `children` activan drill-down: al click, la sidebar
   muestra solo los hijos con flecha "← Volver".
   ────────────────────────────────────────────────────────────── */
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Dashboard',      href: '/admin',               icon: <IconDashboard /> },
      {
        label: 'Grupo',          href: '/admin/grupo',         icon: <IconCorporativo />,
        description: 'Empresas del grupo (multi-SL): Cathedral House Investment + futuras SL hermanas',
      },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { label: 'Leads',          href: '/admin/leads',         icon: <IconLeads /> },
      { label: 'Clientes',       href: '/admin/clientes',      icon: <IconClientes /> },
      { label: 'Presupuestos',   href: '/admin/presupuestos',  icon: <IconPresupuestos /> },
    ],
  },
  {
    label: 'Obra & Operaciones',
    items: [
      { label: 'Proyectos',      href: '/admin/proyectos',     icon: <IconProyectos /> },
      { label: 'Operaciones',    href: '/admin/operaciones',   icon: <IconOperaciones /> },
      { label: 'Proveedores',    href: '/admin/proveedores',   icon: <IconProveedores /> },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      {
        label: 'Facturas',       href: '/admin/facturas',      icon: <IconFacturas />,
        children: [
          { label: 'Todas',                href: '/admin/facturas' },
          { label: 'Emitidas (cobros)',    href: '/admin/facturas?direccion=emitida' },
          { label: 'Recibidas (pagos)',    href: '/admin/facturas?direccion=recibida' },
          { label: '— Alertas IA',         href: '#header' },
          { label: 'Errores',              href: '/admin/facturas?alerta=errores',         badge: 'red',   badgeKey: 'errors' },
          { label: 'Manuscritos',          href: '/admin/facturas?alerta=manuscritos' },
          { label: 'Mala calidad imagen',  href: '/admin/facturas?alerta=mala_calidad' },
          { label: 'Datos dudosos',        href: '/admin/facturas?alerta=datos_dudosos' },
          { label: 'Fecha sospechosa',     href: '/admin/facturas?alerta=fecha_alerta' },
          { label: 'Importe sospechoso',   href: '/admin/facturas?alerta=importe_alerta' },
        ],
      },
      {
        label: 'Personal',       href: '/admin/personal',      icon: <IconPersonal />,
        badge: 'red', badgeKey: 'errors',
        children: [
          { label: 'Resumen',              href: '/admin/personal' },
          { label: 'Trabajadores',         href: '/admin/personal?seccion=trabajadores' },
          { label: 'Nóminas y pagos',      href: '/admin/personal?seccion=nominas' },
          { label: 'Tiempo y permisos',    href: '/admin/personal?seccion=tiempo' },
          { label: 'Dietario (partes horas)', href: '/admin/personal/dietario' },
          { label: 'Cumplimiento legal',   href: '/admin/personal?seccion=cumplimiento' },
          { label: 'Prevención (PRL)',     href: '/admin/personal?seccion=prl' },
        ],
      },
      { label: 'Informes',       href: '/admin/informes',      icon: <IconInformes /> },
      {
        label: 'Fiscal AEAT',    href: '/admin/fiscal',        icon: <IconFiscal />,
        description: 'Calendario AEAT + generador automático borradores 303/111 desde invoices',
      },
    ],
  },
  {
    label: 'Documentos',
    items: [
      { label: 'Escrituras',     href: '/admin/documentos/escrituras',  icon: <IconEscrituras /> },
      { label: 'Contratos',      href: '/admin/documentos/contratos',   icon: <IconContratos /> },
      { label: 'Licencias',      href: '/admin/documentos/licencias',   icon: <IconLicencias /> },
      { label: 'Seguros',        href: '/admin/documentos/seguros',     icon: <IconSeguros /> },
      { label: 'Fiscal',         href: '/admin/documentos/fiscal',      icon: <IconFiscal /> },
      { label: 'Flota & Gastos', href: '/admin/documentos/flota',       icon: <IconFlota /> },
      { label: 'Corporativo',    href: '/admin/documentos/corporativo', icon: <IconCorporativo /> },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        label: 'Revisión IA',    href: '/admin/revision',      icon: <IconRevision />,
        description: 'Documentos extraídos por IA pendientes de validar manualmente',
        badge: 'red', badgeKey: 'orphans',
        children: [
          { label: 'Todos pendientes',    href: '/admin/revision' },
          { label: 'Procesados IA',       href: '/admin/revision?cat=procesados_ia' },
          { label: 'Duplicados',          href: '/admin/revision?cat=duplicados' },
          { label: 'No legibles',         href: '/admin/revision?cat=no_legibles' },
          { label: 'Sin clasificar',      href: '/admin/revision?cat=sin_clasificar' },
          { label: 'Datos incompletos',   href: '/admin/revision?cat=datos_incompletos' },
          { label: 'Baja confianza',      href: '/admin/revision?cat=baja_confianza' },
          { label: 'Reenviadas',          href: '/admin/revision?cat=reenviadas' },
          { label: 'Huérfanos persistentes', href: '/admin/revision?cat=huerfanos_persistentes', badge: 'red', badgeKey: 'orphans' },
          { label: 'Documentos pendientes', href: '/admin/revision?cat=documentos_pendientes' },
          { label: 'Resueltos',           href: '/admin/revision?cat=resueltos' },
        ],
      },
      {
        label: 'Forensic',       href: '/admin/forensic',      icon: <IconForensic />,
        description: 'Análisis forense anti-fraude: detecta manipulación, duplicados y datos sospechosos',
        children: [
          { label: 'Todas',                href: '/admin/forensic' },
          { label: 'Críticas (<50)',       href: '/admin/forensic?cat=criticas' },
          { label: 'Revisión (50-79)',     href: '/admin/forensic?cat=revision' },
          { label: 'Limpias (≥80)',        href: '/admin/forensic?cat=limpias' },
          { label: 'Sin decidir',          href: '/admin/forensic?cat=sin_decidir' },
          { label: 'Con alertas',          href: '/admin/forensic?cat=con_alertas' },
        ],
      },
      {
        label: 'Eval (métricas)', href: '/admin/eval',         icon: <IconEval />,
        description: 'Salud del sistema: cobertura de datos, errores, coste real de la IA',
        badge: 'red', badgeKey: 'notif_critical',
      },
      {
        label: 'Sistema',        href: '/admin/sistema',       icon: <IconSistema />,
        description: 'Estado del workflow + acciones operativas (forzar healthcheck, limpiar, etc.)',
      },
      { label: 'Archivo',        href: '/admin/archivo',       icon: <IconArchivo /> },
      { label: 'Papelera',       href: '/admin/papelera',      icon: <IconPapelera /> },
      { label: 'Configuración',  href: '/admin/configuracion', icon: <IconConfiguracion /> },
    ],
  },
]

interface AdminSidebarProps {
  isOpen?: boolean
  onToggle?: () => void
}

export default function AdminSidebar({ isOpen = false, onToggle }: AdminSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [revisionCount, setRevisionCount] = useState<number | null>(null)
  const [errorCount, setErrorCount] = useState<number | null>(null)
  const [orphanCount, setOrphanCount] = useState<number | null>(null)
  const [notifCritical, setNotifCritical] = useState<number | null>(null)
  const [notifWarning, setNotifWarning] = useState<number | null>(null)
  // Drill-down: label del item padre cuyo árbol estamos mostrando.
  // Inicializado de forma síncrona desde pathname para que en el primer render
  // ya aparezca el drill correcto sin parpadeo.
  const [drillInto, setDrillInto] = useState<string | null>(() => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (item.children && pathname === item.href.split('?')[0]) {
          return item.label
        }
      }
    }
    return null
  })

  // Track de "el usuario cerró voluntariamente el drill estando en este path".
  // Sin este ref, al pulsar "Volver al menú" el useEffect siguiente reabriría
  // el drill instantáneamente porque el pathname sigue siendo el mismo.
  const userClosedAtPathRef = useRef<string | null>(null)

  // Auto-abrir/cerrar drill cuando cambia el pathname (navegación nueva).
  // No depende de `drillInto` para no entrar en bucle al cerrar manualmente.
  useEffect(() => {
    // Si el usuario cerró el drill estando en este mismo path, respetarlo
    if (userClosedAtPathRef.current === pathname) return
    // Al cambiar de path, resetear el flag de cierre voluntario
    userClosedAtPathRef.current = null

    let foundDrillItem: string | null = null
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (item.children && pathname === item.href.split('?')[0]) {
          foundDrillItem = item.label
          break
        }
      }
      if (foundDrillItem) break
    }
    setDrillInto(foundDrillItem)
  }, [pathname])

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
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    // scope: 'global' invalida la sesión en TODOS los dispositivos (no solo este navegador).
    // Si sospechas compromiso, hacer logout aquí cierra todas las sesiones simultáneamente.
    await supabase.auth.signOut({ scope: 'global' })
    router.push('/admin/login')
    router.refresh()
  }

  const handleRefresh = () => {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1500)
  }

  const isActive = (href: string) =>
    href === '/admin'
      ? pathname === '/admin'
      : pathname.startsWith(href.split('?')[0])

  // ¿El item del sub-menu está activo? Comparar pathname + query strings
  const isSubItemActive = (href: string): boolean => {
    if (href === '#header') return false
    const [pathPart, queryPart] = href.split('?')
    if (pathname !== pathPart) return false
    if (!queryPart) {
      // Item "default" (sin query) — activo solo si NO hay queries específicos
      const currentParams = searchParams?.toString() ?? ''
      // Si existe otro item con query que coincide con current, NO marcar default activo
      if (drilledItem) {
        const hasOtherMatch = drilledItem.children?.some(c => {
          const [cPath, cQuery] = c.href.split('?')
          return cPath === pathPart && cQuery && currentParams.includes(cQuery)
        })
        if (hasOtherMatch) return false
      }
      return currentParams === '' || !drilledItem?.children?.some(c => c.href.includes('?') && pathname === c.href.split('?')[0])
    }
    // Verificar que cada param del href coincide con searchParams
    const hrefParams = new URLSearchParams(queryPart)
    for (const [k, v] of hrefParams) {
      if (searchParams?.get(k) !== v) return false
    }
    return true
  }

  // Item con drill activo (si lo hay)
  const drilledItem = useMemo(() => {
    if (!drillInto) return null
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (item.label === drillInto) return item
      }
    }
    return null
  }, [drillInto])

  // Helpers contadores
  const getBadge = (badgeKey?: string): { count: number; color: string } | null => {
    if (badgeKey === 'errors' && errorCount !== null && errorCount > 0)
      return { count: errorCount, color: 'bg-red-500' }
    if (badgeKey === 'review' && revisionCount !== null && revisionCount > 0)
      return { count: revisionCount, color: 'bg-amber-500' }
    if (badgeKey === 'notif_critical' && notifCritical !== null && notifCritical > 0)
      return { count: notifCritical, color: 'bg-red-600' }
    if (badgeKey === 'notif_warning' && notifWarning !== null && notifWarning > 0)
      return { count: notifWarning, color: 'bg-amber-600' }
    if (badgeKey === 'orphans' && orphanCount !== null && orphanCount > 0)
      return { count: orphanCount, color: 'bg-red-500' }
    return null
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-56 bg-white border-r border-neutral-100 flex flex-col z-40 transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0`}
      >
        {/* Header */}
        <div className="px-5 py-5 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Cathedral Group</p>
            <p className="text-sm font-semibold mt-0.5 text-neutral-800">Panel Admin</p>
          </div>
          <button
            onClick={onToggle}
            className="md:hidden p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-800 transition-colors"
            aria-label="Cerrar menú"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Active company badge (F3.5 — Bloque 0 multi-empresa) */}
        <ActiveCompanyBadge />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto relative">
          {/* ─── VISTA PRINCIPAL ─── */}
          <div
            className={`py-3 transition-transform duration-200 ease-out ${
              drilledItem ? '-translate-x-full opacity-0 pointer-events-none absolute inset-0' : 'translate-x-0 opacity-100'
            }`}
          >
            {NAV_SECTIONS.map((section) => (
              <div key={section.label} className="mb-1">
                <p className="px-5 pt-3 pb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-300 select-none">
                  {section.label}
                </p>
                {section.items.map((item) => {
                  const { label, href, icon, children, badgeKey, description } = item
                  const isRevision = href === '/admin/revision'
                  const isFacturas = href === '/admin/facturas'
                  const active = isActive(href)
                  const hasChildren = !!(children && children.length > 0)
                  // Badges legacy + del propio item
                  const badge = getBadge(badgeKey)
                  const showRevisionBadge = isRevision && revisionCount !== null && revisionCount > 0
                  const showFacturasErrorsBadge = isFacturas && !badge && errorCount !== null && errorCount > 0
                  return (
                    <a
                      key={href}
                      href={hasChildren ? '#' : href}
                      onClick={(e) => {
                        if (hasChildren) {
                          e.preventDefault()
                          setDrillInto(label)
                          return
                        }
                        if (onToggle && typeof window !== 'undefined' && window.innerWidth < 768) {
                          onToggle()
                        }
                      }}
                      className={`flex items-start gap-2.5 px-5 py-2.5 text-sm transition-colors ${
                        active && !hasChildren
                          ? 'bg-primary/8 text-primary font-semibold border-r-2 border-primary'
                          : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                      }`}
                    >
                      <span className={`mt-0.5 ${active && !hasChildren ? 'text-primary' : 'text-neutral-400'}`}>
                        {icon}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span>{label}</span>
                          {/* Badges */}
                          {badge && (
                            <span className={`${badge.color} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none`}>
                              {badge.count > 99 ? '99+' : badge.count}
                            </span>
                          )}
                          {showRevisionBadge && (
                            <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                              {revisionCount! > 99 ? '99+' : revisionCount}
                            </span>
                          )}
                          {showFacturasErrorsBadge && (
                            <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                              {errorCount! > 99 ? '99+' : errorCount}
                            </span>
                          )}
                          {/* Indicador drill-down */}
                          {hasChildren && (
                            <span className="text-neutral-300 text-xs ml-auto">›</span>
                          )}
                        </span>
                        {description && (
                          <span className="block text-[10px] text-neutral-400 leading-tight mt-0.5 font-normal">
                            {description}
                          </span>
                        )}
                      </span>
                    </a>
                  )
                })}
              </div>
            ))}
          </div>

          {/* ─── VISTA DRILL-DOWN ─── */}
          {drilledItem && (
            <div className="py-3 transition-transform duration-200 ease-out animate-slide-in-right">
              {/* Botón ← Volver + título */}
              <button
                onClick={() => {
                  // Marcar que el usuario cerró voluntariamente en este path
                  // para que el useEffect no lo reabra inmediatamente
                  userClosedAtPathRef.current = pathname
                  setDrillInto(null)
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors border-b border-neutral-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                <span>Volver al menú</span>
              </button>

              {/* Título de la sección */}
              <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                <span className="text-primary">{drilledItem.icon}</span>
                <span className="text-sm font-bold text-neutral-800">{drilledItem.label}</span>
              </div>

              {/* Sub-items */}
              <div className="mt-1">
                {drilledItem.children!.map((child) => {
                  if (child.href === '#header') {
                    // Separador visual
                    return (
                      <p key={child.label} className="px-5 pt-4 pb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-300 select-none">
                        {child.label.replace(/—/g, '').trim()}
                      </p>
                    )
                  }
                  const childActive = isSubItemActive(child.href)
                  const cBadge = getBadge(child.badgeKey)
                  return (
                    <a
                      key={child.href + child.label}
                      href={child.href}
                      onClick={() => {
                        if (onToggle && typeof window !== 'undefined' && window.innerWidth < 768) {
                          onToggle()
                        }
                      }}
                      className={`flex items-center gap-2 px-5 py-2 text-sm transition-colors ${
                        childActive
                          ? 'bg-primary/8 text-primary font-semibold border-r-2 border-primary'
                          : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                      }`}
                    >
                      <span className="flex-1">{child.label}</span>
                      {cBadge && (
                        <span className={`${cBadge.color} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none`}>
                          {cBadge.count > 99 ? '99+' : cBadge.count}
                        </span>
                      )}
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-neutral-100 flex items-center justify-between gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refrescar datos"
            className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {refreshing ? 'Refrescando' : 'Refrescar'}
          </button>
          <button
            onClick={handleLogout}
            className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-red-500 transition-colors"
          >
            Salir
          </button>
        </div>
      </aside>
    </>
  )
}
