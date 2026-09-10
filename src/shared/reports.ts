import {
  bahtSold,
  fuelById,
  machineDay,
  machinesForTank,
  nozzleListLabel,
  roundBaht,
  roundLiters,
  sortedFuelTypes,
  sortedTanks,
  totalsForFuel,
  type DayReadings,
  type FuelTotals,
  type FuelType,
  type StationConfig,
  type Tank
} from './station'

export interface FuelAdjustments {
  testLiters: number
  ownUseLiters: number
  tradeDiscountBaht: number
  creditDiscountBaht: number
  inputVatBaht: number
}

export interface TaxInvoiceLine {
  bookNo: string
  fromNo: string
  toNo: string
  count: number
  amount: number
  vat: number
}

export interface DeliveryNote {
  seq: number
  number: string
  date: string
  wholesaler: string
  issuer: string
  litersByFuel: Record<string, number>
  litersByTank: Record<string, number>
}

export interface DayRecord {
  meters: DayReadings
  prices: Record<string, number>
  adjustments: Record<string, FuelAdjustments>
  tankSticks: Record<string, number>
  tankStarts: Record<string, number>
  varianceStarts: Record<string, number>
  deliveries: DeliveryNote[]
  fullInvoices: TaxInvoiceLine[]
  shortInvoices: TaxInvoiceLine[]
  savedAt?: string
}

export function emptyAdjustments(): FuelAdjustments {
  return {
    testLiters: 0,
    ownUseLiters: 0,
    tradeDiscountBaht: 0,
    creditDiscountBaht: 0,
    inputVatBaht: 0
  }
}

export function emptyInvoiceLine(): TaxInvoiceLine {
  return {
    bookNo: '',
    fromNo: '',
    toNo: '',
    count: 0,
    amount: 0,
    vat: 0
  }
}

export function emptyDelivery(seq: number, date = ''): DeliveryNote {
  return {
    seq,
    number: '',
    date,
    wholesaler: '',
    issuer: '',
    litersByFuel: {},
    litersByTank: {}
  }
}

export function emptyDay(): DayRecord {
  return {
    meters: {},
    prices: {},
    adjustments: {},
    tankSticks: {},
    tankStarts: {},
    varianceStarts: {},
    deliveries: [],
    fullInvoices: [],
    shortInvoices: []
  }
}

export function isDayRecord(value: unknown): value is DayRecord {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<DayRecord>
  return record.meters != null && typeof record.meters === 'object' && !Array.isArray(record.meters)
}

function isLegacyMeters(value: unknown): value is DayReadings {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if ('meters' in record) return false
  return Object.values(record).every((item) => typeof item === 'number')
}

function normalizeDelivery(note: DeliveryNote): DeliveryNote {
  return {
    ...note,
    litersByFuel: note.litersByFuel ?? {},
    litersByTank: note.litersByTank ?? {}
  }
}

export function normalizeDay(value: unknown): DayRecord {
  if (isDayRecord(value)) {
    return {
      meters: value.meters ?? {},
      prices: value.prices ?? {},
      adjustments: value.adjustments ?? {},
      tankSticks: value.tankSticks ?? {},
      tankStarts: value.tankStarts ?? {},
      varianceStarts: value.varianceStarts ?? {},
      deliveries: (value.deliveries ?? []).map(normalizeDelivery),
      fullInvoices: value.fullInvoices ?? [],
      shortInvoices: value.shortInvoices ?? [],
      savedAt: value.savedAt
    }
  }
  if (isLegacyMeters(value)) {
    return { ...emptyDay(), meters: value }
  }
  return emptyDay()
}

export function normalizeDays(days: Record<string, unknown>): Record<string, DayRecord> {
  return Object.fromEntries(Object.entries(days).map(([date, value]) => [date, normalizeDay(value)]))
}

export function meterHistory(days: Record<string, DayRecord>): Record<string, DayReadings> {
  return Object.fromEntries(Object.entries(days).map(([date, day]) => [date, day.meters]))
}

export function outputVatIncluded(netBaht: number): number {
  if (!Number.isFinite(netBaht) || netBaht <= 0) return 0
  return roundBaht((netBaht * 7) / 107)
}

export interface KorFuelSheet {
  fuel: FuelType
  gross: FuelTotals
  testLiters: number
  testBaht: number
  ownUseLiters: number
  ownUseBaht: number
  dailySales: FuelTotals
  tradeDiscountBaht: number
  creditDiscountBaht: number
  netLiters: number
  netBaht: number
  outputVat: number
  inputVat: number
}

export function previousPriceFor(
  fuel: FuelType,
  date: string,
  days: Record<string, DayRecord>
): number | null {
  const previous = Object.keys(days)
    .filter((key) => key < date)
    .sort()

  for (let index = previous.length - 1; index >= 0; index -= 1) {
    const value = days[previous[index]]?.prices?.[fuel.id]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  }

  return null
}

export function priceForFuel(
  fuel: FuelType,
  date: string,
  days: Record<string, DayRecord>,
  today: DayRecord
): number {
  const typed = today.prices?.[fuel.id]
  if (typeof typed === 'number' && Number.isFinite(typed) && typed > 0) return typed
  return previousPriceFor(fuel, date, days) ?? 0
}

export function defaultPrices(
  config: StationConfig,
  date: string,
  days: Record<string, DayRecord>,
  today: DayRecord
): Record<string, number> {
  const prices: Record<string, number> = { ...(today.prices ?? {}) }
  for (const fuel of sortedFuelTypes(config)) {
    if (prices[fuel.id] == null || prices[fuel.id] <= 0) {
      prices[fuel.id] = priceForFuel(fuel, date, days, today)
    }
  }
  return prices
}

export function adjustmentsFor(day: DayRecord, fuelTypeId: string): FuelAdjustments {
  return { ...emptyAdjustments(), ...(day.adjustments[fuelTypeId] ?? {}) }
}

export function korFuelSheet(
  config: StationConfig,
  fuel: FuelType,
  date: string,
  history: Record<string, DayReadings>,
  day: DayRecord,
  days: Record<string, DayRecord>
): KorFuelSheet {
  const price = priceForFuel(fuel, date, days, day)
  const priced: FuelType = { ...fuel, pricePerLiter: price }
  const adj = adjustmentsFor(day, fuel.id)
  const gross = totalsForFuel(config, priced, date, history, day.meters)
  const testLiters = adj.testLiters || 0
  const ownUseLiters = adj.ownUseLiters || 0
  const testBaht = bahtSold(testLiters, price)
  const ownUseBaht = bahtSold(ownUseLiters, price)
  const dailySales: FuelTotals = {
    liters: roundLiters(Math.max(0, gross.liters - testLiters - ownUseLiters)),
    baht: roundBaht(Math.max(0, gross.baht - testBaht - ownUseBaht))
  }
  const tradeDiscountBaht = adj.tradeDiscountBaht || 0
  const creditDiscountBaht = adj.creditDiscountBaht || 0
  const netLiters = dailySales.liters
  const netBaht = roundBaht(Math.max(0, dailySales.baht - tradeDiscountBaht - creditDiscountBaht))
  return {
    fuel: priced,
    gross,
    testLiters,
    testBaht,
    ownUseLiters,
    ownUseBaht,
    dailySales,
    tradeDiscountBaht,
    creditDiscountBaht,
    netLiters,
    netBaht,
    outputVat: outputVatIncluded(netBaht),
    inputVat: adj.inputVatBaht || 0
  }
}

export function korSheets(
  config: StationConfig,
  date: string,
  days: Record<string, DayRecord>,
  day: DayRecord
): KorFuelSheet[] {
  const history = meterHistory(days)
  return sortedFuelTypes(config).map((fuel) => korFuelSheet(config, fuel, date, history, day, days))
}

export function korGrandTotals(sheets: KorFuelSheet[]): {
  outputVat: number
  inputVat: number
  netBaht: number
} {
  return sheets.reduce(
    (sum, sheet) => ({
      outputVat: roundBaht(sum.outputVat + sheet.outputVat),
      inputVat: roundBaht(sum.inputVat + sheet.inputVat),
      netBaht: roundBaht(sum.netBaht + sheet.netBaht)
    }),
    { outputVat: 0, inputVat: 0, netBaht: 0 }
  )
}

export function receivedLiters(day: DayRecord, fuelTypeId: string): number {
  return roundLiters(
    day.deliveries.reduce((sum, note) => sum + (note.litersByFuel[fuelTypeId] || 0), 0)
  )
}

export function receivedLitersForTank(day: DayRecord, tank: Tank, config: StationConfig): number {
  const fromTank = roundLiters(
    day.deliveries.reduce((sum, note) => sum + (note.litersByTank?.[tank.id] || 0), 0)
  )
  if (fromTank > 0) return fromTank

  const siblings = sortedTanks(config).filter((item) => item.fuelTypeId === tank.fuelTypeId)
  if (siblings[0]?.id !== tank.id) return 0
  return receivedLiters(day, tank.fuelTypeId)
}

export function tankSoldLiters(
  config: StationConfig,
  tank: Tank,
  date: string,
  history: Record<string, DayReadings>,
  day: DayRecord,
  days: Record<string, DayRecord>
): number {
  const fuel = fuelById(config, tank.fuelTypeId)
  if (!fuel) return 0
  const price = priceForFuel(fuel, date, days, day)
  return machinesForTank(config, tank).reduce((sum, machine) => {
    const row = machineDay(machine, date, history, price, day.meters)
    return roundLiters(sum + (row.liters ?? 0))
  }, 0)
}

function tankTestLiters(config: StationConfig, tank: Tank, day: DayRecord): number {
  const fuelTest = adjustmentsFor(day, tank.fuelTypeId).testLiters || 0
  if (fuelTest <= 0) return 0
  const first = sortedTanks(config).find((item) => item.fuelTypeId === tank.fuelTypeId)
  return first?.id === tank.id ? fuelTest : 0
}

/** Book stock: start + received − meter sales + test (test is pumped then returned). Own-use stays in sales. */
export function tankBookLiters(
  start: number,
  received: number,
  sold: number,
  testLiters: number
): number {
  return roundLiters(start + received - sold + testLiters)
}

function previousClosing(
  _config: StationConfig,
  tank: Tank,
  date: string,
  days: Record<string, DayRecord>
): number | null {
  const previous = Object.keys(days)
    .filter((day) => day < date)
    .sort()

  for (let index = previous.length - 1; index >= 0; index -= 1) {
    const value = days[previous[index]]?.tankSticks?.[tank.id]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }

  return null
}

export function tankStartStock(
  config: StationConfig,
  tank: Tank,
  date: string,
  days: Record<string, DayRecord>,
  today: DayRecord
): number | null {
  const previous = previousClosing(config, tank, date, days)
  if (previous != null) return previous

  const typed = today.tankStarts?.[tank.id]
  if (typeof typed === 'number' && Number.isFinite(typed)) return typed

  if (typeof tank.openingStock === 'number' && Number.isFinite(tank.openingStock)) {
    return tank.openingStock
  }
  return null
}

export interface KhorTankSheet {
  tank: Tank
  fuel: FuelType
  nozzleLabel: string
  actualEnd: number | null
  actualStart: number | null
  startEditable: boolean
  received: number
  sold: number
  testLiters: number
  book: number | null
  variance: number | null
  varianceBrought: number
  varianceBroughtEditable: boolean
  varianceCarry: number | null
}

function sameTaxMonth(left: string, right: string): boolean {
  return left.slice(0, 7) === right.slice(0, 7)
}

function priorSameMonthDays(date: string, days: Record<string, DayRecord>): string[] {
  return Object.keys(days)
    .filter((key) => key < date && sameTaxMonth(key, date))
    .sort()
}

function typedVarianceStart(record: DayRecord, tankId: string): number {
  const raw = record.varianceStarts?.[tankId]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

function hasEarlierTaxMonth(date: string, days: Record<string, DayRecord>): boolean {
  const month = date.slice(0, 7)
  return Object.keys(days).some((key) => key.slice(0, 7) < month)
}

function setupOpeningVariance(tank: Tank): number {
  return typeof tank.openingVariance === 'number' && Number.isFinite(tank.openingVariance)
    ? tank.openingVariance
    : 0
}

function varianceBroughtForward(
  tank: Tank,
  config: StationConfig,
  date: string,
  days: Record<string, DayRecord>,
  today: DayRecord
): number {
  const previous = priorSameMonthDays(date, days)
  const openingRecord = previous.length === 0 ? today : (days[previous[0]] ?? emptyDay())
  const history = meterHistory(days)
  let brought = typedVarianceStart(openingRecord, tank.id)
  if (
    previous.length === 0 &&
    openingRecord.varianceStarts?.[tank.id] == null &&
    !hasEarlierTaxMonth(date, days)
  ) {
    brought = setupOpeningVariance(tank)
  }

  for (const key of previous) {
    const rec = days[key] ?? emptyDay()
    const start = tankStartStock(config, tank, key, days, rec)
    const rawEnd = rec.tankSticks[tank.id]
    const end = typeof rawEnd === 'number' && Number.isFinite(rawEnd) ? rawEnd : null
    if (start == null || end == null) continue

    const sold = tankSoldLiters(config, tank, key, history, rec, days)
    const received = receivedLitersForTank(rec, tank, config)
    const book = tankBookLiters(start, received, sold, tankTestLiters(config, tank, rec))
    const variance = roundLiters(end - book)
    brought = roundLiters(brought + variance)
  }

  return brought
}

export function khorSheets(
  config: StationConfig,
  date: string,
  days: Record<string, DayRecord>,
  day: DayRecord
): KhorTankSheet[] {
  const history = meterHistory(days)

  return sortedTanks(config).flatMap((tank) => {
    const fuel = fuelById(config, tank.fuelTypeId)
    if (!fuel) return []

    const startEditable = previousClosing(config, tank, date, days) == null
    const actualStart = tankStartStock(config, tank, date, days, day)
    const received = receivedLitersForTank(day, tank, config)
    const sold = tankSoldLiters(config, tank, date, history, day, days)
    const testLiters = tankTestLiters(config, tank, day)
    const book =
      actualStart == null ? null : tankBookLiters(actualStart, received, sold, testLiters)
    const rawEnd = day.tankSticks[tank.id]
    const actualEnd = typeof rawEnd === 'number' && Number.isFinite(rawEnd) ? rawEnd : null
    const variance = actualEnd == null || book == null ? null : roundLiters(actualEnd - book)
    const varianceBroughtEditable = priorSameMonthDays(date, days).length === 0
    const varianceBrought = varianceBroughtForward(tank, config, date, days, day)

    return [
      {
        tank,
        fuel,
        nozzleLabel: nozzleListLabel(machinesForTank(config, tank)),
        actualEnd,
        actualStart,
        startEditable,
        received,
        sold,
        testLiters,
        book,
        variance,
        varianceBrought,
        varianceBroughtEditable,
        varianceCarry: variance == null ? null : roundLiters(variance + varianceBrought)
      }
    ]
  })
}

export function invoiceTotals(lines: TaxInvoiceLine[]): { amount: number; vat: number; count: number } {
  return lines.reduce(
    (sum, line) => ({
      amount: roundBaht(sum.amount + (line.amount || 0)),
      vat: roundBaht(sum.vat + (line.vat || 0)),
      count: sum.count + (line.count || 0)
    }),
    { amount: 0, vat: 0, count: 0 }
  )
}

function hasInvoiceLine(line: TaxInvoiceLine): boolean {
  return (
    line.bookNo.trim() !== '' ||
    line.fromNo.trim() !== '' ||
    line.toNo.trim() !== '' ||
    (line.count || 0) > 0 ||
    (line.amount || 0) > 0 ||
    (line.vat || 0) > 0
  )
}

function hasDeliveryContent(note: DeliveryNote): boolean {
  return (
    note.number.trim() !== '' ||
    note.wholesaler.trim() !== '' ||
    note.issuer.trim() !== '' ||
    Object.values(note.litersByFuel).some((value) => (value || 0) > 0) ||
    Object.values(note.litersByTank ?? {}).some((value) => (value || 0) > 0)
  )
}

export function hasInvoicePage(day: DayRecord): boolean {
  return day.fullInvoices.some(hasInvoiceLine) || day.shortInvoices.some(hasInvoiceLine)
}

export function compactDay(day: DayRecord): DayRecord {
  return {
    meters: day.meters,
    adjustments: day.adjustments,
    tankSticks: day.tankSticks,
    tankStarts: day.tankStarts,
    varianceStarts: day.varianceStarts ?? {},
    prices: day.prices ?? {},
    deliveries: day.deliveries.filter(hasDeliveryContent).map((note, index) => ({
      ...note,
      seq: index + 1
    })),
    fullInvoices: day.fullInvoices.filter(hasInvoiceLine),
    shortInvoices: day.shortInvoices.filter(hasInvoiceLine),
    savedAt: day.savedAt
  }
}
