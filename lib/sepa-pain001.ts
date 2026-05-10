/**
 * lib/sepa-pain001.ts — B11
 *
 * Construye XML SEPA Pain.001.001.03 (Customer Credit Transfer Initiation)
 * desde JSON estructurado. Es el formato estándar bancos europeos para
 * transferencias masivas (nóminas, pago facturas, modelos AEAT con NRC).
 *
 * Spec: ISO 20022 + adaptación SEPA Implementation Guidelines.
 *
 * El XML resultante David lo sube al portal del banco (BBVA, Santander,
 * ING, Sabadell, etc.) para ejecutar todas las transferencias en una sola
 * operación atómica.
 */

interface Payment {
  end_to_end_id: string
  amount: number
  iban: string
  creditor_name: string
  creditor_nif?: string | null
  concept: string
}

interface Debtor {
  iban: string
  bic?: string | null
  bank_name?: string | null
  alias?: string | null
  titular?: string | null
}

interface Company {
  cif: string
  razon_social: string
}

export interface Pain001Input {
  company: Company
  debtor: Debtor
  payments: Payment[]
  total_amount: number
  count: number
  currency?: string                  // 'EUR' default
  execution_date?: string            // 'YYYY-MM-DD' default = mañana
  message_id_prefix?: string         // 'NOMINA' | 'FACTURAS' | 'MODELOS'
}

const escXml = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const fmtAmt = (n: number): string => Number(n).toFixed(2)

const cleanIban = (iban: string): string =>
  String(iban ?? '').replace(/\s+/g, '').toUpperCase()

/**
 * Construye XML Pain.001.001.03 SEPA-compliant.
 */
export function buildPain001Xml(input: Pain001Input): string {
  const currency = input.currency ?? 'EUR'
  const execDate = input.execution_date ?? (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  })()
  const prefix = input.message_id_prefix ?? 'PAY'
  const now = new Date().toISOString().slice(0, 19) // sin zona, formato xsd:dateTime
  const msgId = `${prefix}-${input.company.cif}-${Date.now()}`.slice(0, 35)
  const pmtInfId = `${prefix}-${execDate.replace(/-/g, '')}`.slice(0, 35)
  const debtorIban = cleanIban(input.debtor.iban)
  const debtorBic = input.debtor.bic?.replace(/\s+/g, '').toUpperCase()

  const txs = input.payments.map((p, idx) => {
    const e2eId = (p.end_to_end_id || `${prefix}-${idx + 1}`).slice(0, 35)
    const cdtrIban = cleanIban(p.iban)
    return `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escXml(e2eId)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="${currency}">${fmtAmt(p.amount)}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <Othr>
              <Id>NOTPROVIDED</Id>
            </Othr>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${escXml(p.creditor_name).slice(0, 70)}</Nm>${
            p.creditor_nif
              ? `\n          <Id><OrgId><Othr><Id>${escXml(p.creditor_nif)}</Id></Othr></OrgId></Id>`
              : ''
          }
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${cdtrIban}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escXml(p.concept).slice(0, 140)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`
  }).join('\n')

  const debtorAgent = debtorBic
    ? `<DbtrAgt>
      <FinInstnId>
        <BIC>${debtorBic}</BIC>
      </FinInstnId>
    </DbtrAgt>`
    : `<DbtrAgt>
      <FinInstnId>
        <Othr>
          <Id>NOTPROVIDED</Id>
        </Othr>
      </FinInstnId>
    </DbtrAgt>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escXml(msgId)}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>${input.count}</NbOfTxs>
      <CtrlSum>${fmtAmt(input.total_amount)}</CtrlSum>
      <InitgPty>
        <Nm>${escXml(input.company.razon_social).slice(0, 70)}</Nm>
        <Id>
          <OrgId>
            <Othr>
              <Id>${escXml(input.company.cif)}</Id>
            </Othr>
          </OrgId>
        </Id>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escXml(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${input.count}</NbOfTxs>
      <CtrlSum>${fmtAmt(input.total_amount)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${execDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escXml(input.debtor.titular ?? input.company.razon_social).slice(0, 70)}</Nm>
        <Id>
          <OrgId>
            <Othr>
              <Id>${escXml(input.company.cif)}</Id>
            </Othr>
          </OrgId>
        </Id>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${debtorIban}</IBAN>
        </Id>
      </DbtrAcct>
      ${debtorAgent}
      <ChrgBr>SLEV</ChrgBr>
${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`
}
