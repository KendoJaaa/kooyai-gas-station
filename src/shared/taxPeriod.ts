import { retentionStart } from './retention'

export interface SalesTaxPeriod {
  month: string
  startDate: string
  endDate: string
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** A tax report covers an inclusive range within one retained tax month. */
export function isSalesTaxPeriod(value: unknown, today: string): value is SalesTaxPeriod {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  const period = value as Partial<SalesTaxPeriod>
  return (
    typeof period.month === 'string' &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(period.month) &&
    isIsoDate(period.startDate) &&
    isIsoDate(period.endDate) &&
    period.startDate.startsWith(`${period.month}-`) &&
    period.endDate.startsWith(`${period.month}-`) &&
    period.startDate <= period.endDate &&
    period.startDate >= retentionStart(today) &&
    period.endDate <= today
  )
}
