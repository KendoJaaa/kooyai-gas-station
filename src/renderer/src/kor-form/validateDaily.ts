import { khorSheets, meterHistory, type DayRecord } from '../../../shared/reports'
import {
  HUGE_SALE_LITERS,
  fuelsWithActiveNozzles,
  litersSold,
  machineInUse,
  startMeterFor,
  type StationConfig
} from '../../../shared/station'
import { parseMeter } from './numbers'

export type DailyFieldKey =
  | `meter:${string}`
  | `price:${string}`
  | `stick:${string}`
  | `start:${string}`
  | `brought:${string}`

export interface DailyIssue {
  key: DailyFieldKey
  message: string
}

export interface HugeSale {
  nozzleNo: number
  liters: number
}

function parseDraft(draft: string | undefined, stored: number | undefined): 'empty' | 'invalid' | number {
  if (draft !== undefined) {
    const trimmed = draft.replace(/,/g, '').trim()
    if (trimmed === '') return 'empty'
    if (/[.\-]$/.test(trimmed)) return 'invalid'
    const parsed = parseMeter(trimmed)
    if (parsed == null) return 'invalid'
    return parsed
  }
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored
  return 'empty'
}

export function validateDailyForm(
  config: StationConfig,
  date: string,
  days: Record<string, DayRecord>,
  day: DayRecord,
  drafts: {
    meters: Record<string, string>
    prices: Record<string, string>
    sticks: Record<string, string>
    starts: Record<string, string>
    broughts: Record<string, string>
  }
): DailyIssue[] {
  const issues: DailyIssue[] = []
  const history = meterHistory(days)

  for (const machine of config.machines) {
    if (!machineInUse(machine)) continue
    const key = `meter:${machine.id}` as const
    const parsed = parseDraft(drafts.meters[machine.id], day.meters[machine.id])
    if (parsed === 'empty') {
      issues.push({ key, message: `กรอกมิเตอร์สิ้นสุด หัวจ่าย ${machine.nozzleNo}` })
      continue
    }
    if (parsed === 'invalid') {
      issues.push({ key, message: `มิเตอร์สิ้นสุด หัวจ่าย ${machine.nozzleNo} ต้องเป็นตัวเลข` })
      continue
    }
    if (parsed < 0) {
      issues.push({ key, message: `มิเตอร์สิ้นสุด หัวจ่าย ${machine.nozzleNo} ต้องไม่ติดลบ` })
      continue
    }
    const start = startMeterFor(machine, date, history)
    if (start != null && parsed < start) {
      issues.push({
        key,
        message: `มิเตอร์สิ้นสุด หัวจ่าย ${machine.nozzleNo} น้อยกว่ามิเตอร์เริ่มต้น`
      })
    }
  }

  for (const fuel of fuelsWithActiveNozzles(config)) {
    const key = `price:${fuel.id}` as const
    const parsed = parseDraft(drafts.prices[fuel.id], day.prices[fuel.id])
    if (parsed === 'empty') {
      issues.push({ key, message: `กรอกราคาน้ำมัน ${fuel.nameTh}` })
      continue
    }
    if (parsed === 'invalid') {
      issues.push({ key, message: `ราคาน้ำมัน ${fuel.nameTh} ต้องเป็นตัวเลข` })
      continue
    }
    if (parsed <= 0) {
      issues.push({ key, message: `ราคาน้ำมัน ${fuel.nameTh} ต้องมากกว่า 0` })
    }
  }

  for (const sheet of khorSheets(config, date, days, day)) {
    const stickKey = `stick:${sheet.tank.id}` as const
    const stick = parseDraft(drafts.sticks[sheet.tank.id], day.tankSticks[sheet.tank.id])
    if (stick === 'empty') {
      issues.push({
        key: stickKey,
        message: `กรอกปริมาณน้ำมันวัดปลายงวด ถังที่ ${sheet.tank.tankNo}`
      })
    } else if (stick === 'invalid') {
      issues.push({
        key: stickKey,
        message: `ปริมาณน้ำมันวัดปลายงวด ถังที่ ${sheet.tank.tankNo} ต้องเป็นตัวเลข`
      })
    } else if (stick < 0) {
      issues.push({
        key: stickKey,
        message: `ปริมาณน้ำมันวัดปลายงวด ถังที่ ${sheet.tank.tankNo} ต้องไม่ติดลบ`
      })
    }

    if (sheet.book != null && sheet.book < 0) {
      issues.push({
        key: sheet.startEditable
          ? (`start:${sheet.tank.id}` as const)
          : stickKey,
        message: `น้ำมันคงเหลือในบัญชี ถังที่ ${sheet.tank.tankNo} ติดลบ ตรวจต้นงวดหรือมิเตอร์`
      })
    }

    if (sheet.varianceBroughtEditable) {
      const brought = parseDraft(drafts.broughts[sheet.tank.id], day.varianceStarts[sheet.tank.id])
      if (brought === 'invalid') {
        issues.push({
          key: `brought:${sheet.tank.id}`,
          message: `ผลต่างสะสมยกมา ถังที่ ${sheet.tank.tankNo} ต้องเป็นตัวเลข`
        })
      }
    }

    if (!sheet.startEditable) continue

    const startKey = `start:${sheet.tank.id}` as const
    const startDraft = drafts.starts[sheet.tank.id]
    const start = parseDraft(startDraft, day.tankStarts[sheet.tank.id])
    const usingDerivedStart = startDraft === undefined && sheet.actualStart != null && start === 'empty'

    if (usingDerivedStart) continue
    if (start === 'empty') {
      issues.push({
        key: startKey,
        message: `กรอกปริมาณน้ำมันต้นงวด ถังที่ ${sheet.tank.tankNo}`
      })
    } else if (start === 'invalid') {
      issues.push({
        key: startKey,
        message: `ปริมาณน้ำมันต้นงวด ถังที่ ${sheet.tank.tankNo} ต้องเป็นตัวเลข`
      })
    } else if (start < 0) {
      issues.push({
        key: startKey,
        message: `ปริมาณน้ำมันต้นงวด ถังที่ ${sheet.tank.tankNo} ต้องไม่ติดลบ`
      })
    }
  }

  return issues
}

export function hugeSales(
  config: StationConfig,
  date: string,
  days: Record<string, DayRecord>,
  day: DayRecord,
  meterDrafts: Record<string, string>
): HugeSale[] {
  const history = meterHistory(days)
  const warnings: HugeSale[] = []

  for (const machine of config.machines) {
    if (!machineInUse(machine)) continue
    const start = startMeterFor(machine, date, history)
    const parsed = parseDraft(meterDrafts[machine.id], day.meters[machine.id])
    if (start == null || typeof parsed !== 'number') continue
    const liters = litersSold(start, parsed)
    if (liters > HUGE_SALE_LITERS) {
      warnings.push({ nozzleNo: machine.nozzleNo, liters })
    }
  }

  return warnings
}

export function issuesToErrorMap(issues: DailyIssue[]): Record<string, string> {
  return Object.fromEntries(issues.map((issue) => [issue.key, issue.message]))
}

export function formatIssueSummary(issues: DailyIssue[]): string {
  const meters = issues.filter((issue) => issue.key.startsWith('meter:'))
  const rest = issues.filter((issue) => !issue.key.startsWith('meter:'))
  const lines: string[] = []
  if (meters.length === 1) lines.push(meters[0].message)
  if (meters.length > 1) lines.push(`กรอกมิเตอร์หัวจ่ายที่ยังว่าง (${meters.length} หัว)`)
  for (const issue of rest.slice(0, meters.length > 1 ? 2 : 3)) {
    lines.push(issue.message)
  }
  const shown = meters.length > 1 ? 1 + Math.min(rest.length, 2) : Math.min(issues.length, 3)
  if (issues.length > shown) lines.push(`และอีก ${issues.length - shown} รายการ`)
  return lines.join('\n')
}
