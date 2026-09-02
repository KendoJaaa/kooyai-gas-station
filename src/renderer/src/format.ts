import dayjs from 'dayjs'
import buddhistEra from 'dayjs/plugin/buddhistEra'
import 'dayjs/locale/th'
import { FUEL_TYPES, type FuelType } from '../../shared/types'

dayjs.extend(buddhistEra)
dayjs.locale('th')

export function formatThaiDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const parsed = dayjs(value)
  if (!parsed.isValid()) return '—'
  return parsed.format('D MMMM BBBB')
}

export function fuelLabel(value: FuelType | string): string {
  return FUEL_TYPES.find((item) => item.value === value)?.label ?? value
}

export function formatLiters(value: number | string | undefined): string {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return '—'
  return `${amount.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ลิตร`
}
