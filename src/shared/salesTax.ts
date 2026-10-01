import { emptyDay, korFuelSheet, meterHistory, priceForFuel, type DayRecord } from './reports'
import {
  fuelById,
  machineDay,
  machinesForTank,
  roundBaht,
  sortedTanks,
  type FuelType,
  type StationConfig,
  type Tank
} from './station'

export interface SalesTaxGroup {
  fuelId: string
  fuelCode: string
  nozzles: number[]
}

export interface SalesTaxLine {
  date: string
  dayNo: number
  firstOfDay: boolean
  nozzles: string
  fuelCode: string
  baseBaht: number
  vatBaht: number
}

export interface SalesTaxReport {
  month: string
  lines: SalesTaxLine[]
  totalBase: number
  totalVat: number
}

function fuelMark(fuel: FuelType): string {
  const text = `${fuel.code} ${fuel.nameTh}`.toUpperCase()
  if (text.includes('E20')) return 'E20'
  if (text.includes('95')) return 'G95'
  if (text.includes('DIESEL') || text.includes('B7') || fuel.nameTh.includes('ดีเซล')) return 'D'
  return fuel.code || fuel.nameTh
}

function nozzleNumbers(config: StationConfig, tank: Tank): number[] {
  return machinesForTank(config, tank)
    .map((machine) => machine.nozzleNo)
    .sort((a, b) => a - b)
}

/** Same-fuel tanks whose nozzle numbers touch become one line, so 7–8 and 9–10 print as 7, 8, 9, 10. */
export function salesTaxGroups(config: StationConfig): SalesTaxGroup[] {
  const tanks = sortedTanks(config)
    .map((tank) => ({ tank, nozzles: nozzleNumbers(config, tank) }))
    .filter((item) => item.nozzles.length > 0)
    .sort((a, b) => a.nozzles[0] - b.nozzles[0])

  const groups: SalesTaxGroup[] = []
  for (const item of tanks) {
    const fuel = fuelById(config, item.tank.fuelTypeId)
    if (!fuel) continue
    const previous = groups[groups.length - 1]
    const touches =
      previous != null &&
      previous.fuelId === fuel.id &&
      item.nozzles[0] === previous.nozzles[previous.nozzles.length - 1] + 1
    if (touches && previous) {
      previous.nozzles.push(...item.nozzles)
      continue
    }
    groups.push({
      fuelId: fuel.id,
      fuelCode: fuelMark(fuel),
      nozzles: [...item.nozzles]
    })
  }
  return groups
}

function monthDates(month: string, today: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return []
  const year = Number(match[1])
  const monthIndex = Number(match[2])
  const count = new Date(year, monthIndex, 0).getDate()
  const dates: string[] = []
  for (let day = 1; day <= count; day += 1) {
    const iso = `${month}-${String(day).padStart(2, '0')}`
    if (iso > today) break
    dates.push(iso)
  }
  return dates
}

function splitAmount(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => roundBaht(acc + weight), 0)
  if (sum <= 0 || total === 0) return weights.map(() => 0)
  const shares = weights.map((weight) => roundBaht((total * weight) / sum))
  const drift = roundBaht(total - shares.reduce((acc, share) => roundBaht(acc + share), 0))
  let index = shares.length - 1
  for (let cursor = shares.length - 1; cursor >= 0; cursor -= 1) {
    if (weights[cursor] > 0) {
      index = cursor
      break
    }
  }
  shares[index] = roundBaht(shares[index] + drift)
  return shares
}

function grossBaht(
  config: StationConfig,
  group: SalesTaxGroup,
  date: string,
  days: Record<string, DayRecord>,
  day: DayRecord,
  history: ReturnType<typeof meterHistory>
): number {
  const fuel = fuelById(config, group.fuelId)
  if (!fuel) return 0
  const price = priceForFuel(fuel, date, days, day)
  const nozzleSet = new Set(group.nozzles)
  return config.machines.reduce((sum, machine) => {
    if (!nozzleSet.has(machine.nozzleNo) || machine.fuelTypeId !== group.fuelId) return sum
    const row = machineDay(machine, date, history, price, day.meters)
    return roundBaht(sum + (row.baht ?? 0))
  }, 0)
}

export function buildSalesTaxReport(
  config: StationConfig,
  days: Record<string, DayRecord>,
  month: string,
  today: string
): SalesTaxReport {
  const groups = salesTaxGroups(config)
  const history = meterHistory(days)
  const lines: SalesTaxLine[] = []
  const dates = monthDates(month, today)

  dates.forEach((date, dateIndex) => {
    const day = days[date]
    const record = day ?? emptyDay()
    const weights = groups.map((group) =>
      day ? grossBaht(config, group, date, days, record, history) : 0
    )
    const netByGroup = groups.map(() => 0)
    const vatByGroup = groups.map(() => 0)
    const fuelIds = [...new Set(groups.map((group) => group.fuelId))]

    for (const fuelId of fuelIds) {
      const fuel = fuelById(config, fuelId)
      if (!fuel) continue
      const sheet = korFuelSheet(config, fuel, date, history, record, days)
      const indexes = groups.map((group, index) => (group.fuelId === fuelId ? index : -1)).filter((index) => index >= 0)
      const fuelWeights = indexes.map((index) => weights[index])
      const nets = splitAmount(sheet.netBaht, fuelWeights)
      const vats = splitAmount(sheet.outputVat, fuelWeights)
      indexes.forEach((index, offset) => {
        netByGroup[index] = nets[offset]
        vatByGroup[index] = vats[offset]
      })
    }

    groups.forEach((group, index) => {
      const vatBaht = vatByGroup[index]
      lines.push({
        date,
        dayNo: dateIndex + 1,
        firstOfDay: index === 0,
        nozzles: group.nozzles.join(', '),
        fuelCode: group.fuelCode,
        baseBaht: roundBaht(netByGroup[index] - vatBaht),
        vatBaht
      })
    })
  })

  return {
    month,
    lines,
    totalBase: roundBaht(lines.reduce((sum, line) => sum + line.baseBaht, 0)),
    totalVat: roundBaht(lines.reduce((sum, line) => sum + line.vatBaht, 0))
  }
}
