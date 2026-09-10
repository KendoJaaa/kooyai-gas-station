import dayjs from 'dayjs'
import buddhistEra from 'dayjs/plugin/buddhistEra'
import 'dayjs/locale/th'

dayjs.extend(buddhistEra)
dayjs.locale('th')

export function isoToday(): string {
  return dayjs().format('YYYY-MM-DD')
}

export function isoYesterday(): string {
  return dayjs().subtract(1, 'day').format('YYYY-MM-DD')
}

export function periodLabel(isoDate: string): string {
  return `วันที่ ${dayjs(isoDate).format('D MMMM BBBB')}`
}

export function printedAtNow(): string {
  return dayjs().format('DD/MM/BBBB HH:mm:ss')
}

export function savedAtLabel(iso: string | undefined): string {
  if (!iso) return 'ยังไม่บันทึก'
  const parsed = dayjs(iso)
  if (!parsed.isValid()) return 'ยังไม่บันทึก'
  return `บันทึกเมื่อ ${parsed.format('DD/MM/BBBB HH:mm:ss')}`
}
