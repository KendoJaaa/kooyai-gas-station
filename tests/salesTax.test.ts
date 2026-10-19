import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyDay } from '../src/shared/reports'
import { DEFAULT_STATION, roundBaht } from '../src/shared/station'
import { buildSalesTaxReport, salesTaxGroups } from '../src/shared/salesTax'
import { isSalesTaxPeriod, type SalesTaxPeriod } from '../src/shared/taxPeriod'

const today = '2026-10-19'
const config = structuredClone(DEFAULT_STATION)
const days = Object.fromEntries([1, 2, 3].map((number) => {
  const day = emptyDay()
  const increase = [100, 150, 225][number - 1]
  day.meters = Object.fromEntries(config.machines.map((machine) => [
    machine.id, roundBaht(machine.openingMeter + increase)
  ]))
  if (number === 1) {
    day.prices = Object.fromEntries(config.fuelTypes.map((fuel) => [fuel.id, fuel.pricePerLiter]))
  }
  if (number === 2) {
    day.adjustments['diesel-b7'] = {
      testLiters: 5, ownUseLiters: 0, tradeDiscountBaht: 15.51,
      creditDiscountBaht: 0, inputVatBaht: 0
    }
  }
  return [`2026-10-0${number}`, day]
}))

function period(start: string, end: string): SalesTaxPeriod {
  return { month: start.slice(0, 7), startDate: start, endDate: end }
}

test('the start and end dates are inclusive and all other dates are excluded', () => {
  const report = buildSalesTaxReport(config, days, period('2026-10-02', '2026-10-03'), today)
  assert.deepEqual([...new Set(report.lines.map((line) => line.date))], ['2026-10-02', '2026-10-03'])
  assert.equal(report.lines.length, salesTaxGroups(config).length * 2)
  assert.equal(report.startDate, '2026-10-02')
  assert.equal(report.endDate, '2026-10-03')
})

test('a single-day export uses earlier meter readings and prices without printing them', () => {
  const report = buildSalesTaxReport(config, days, period('2026-10-02', '2026-10-02'), today)
  const gross = config.fuelTypes.reduce((sum, fuel) => {
    const nozzles = config.machines.filter((machine) => machine.fuelTypeId === fuel.id).length
    return sum + nozzles * 50 * fuel.pricePerLiter
  }, 0)
  const dieselPrice = config.fuelTypes.find((fuel) => fuel.id === 'diesel-b7')!.pricePerLiter
  const expectedNet = roundBaht(gross - 5 * dieselPrice - 15.51)
  assert.ok(report.lines.every((line) => line.date === '2026-10-02'))
  assert.equal(roundBaht(report.totalBase + report.totalVat), expectedNet)
})

test('consecutive exports do not overlap and their totals match the combined period', () => {
  const first = buildSalesTaxReport(config, days, period('2026-10-01', '2026-10-01'), today)
  const next = buildSalesTaxReport(config, days, period('2026-10-02', '2026-10-03'), today)
  const combined = buildSalesTaxReport(config, days, period('2026-10-01', '2026-10-03'), today)
  assert.equal(roundBaht(first.totalBase + next.totalBase), combined.totalBase)
  assert.equal(roundBaht(first.totalVat + next.totalVat), combined.totalVat)
  assert.ok(!next.lines.some((line) => first.lines.some((previous) => previous.date === line.date)))
})

test('missing saved days stay blank and do not add tax', () => {
  const report = buildSalesTaxReport(config, days, period('2026-10-04', '2026-10-05'), today)
  assert.equal(report.lines.length, salesTaxGroups(config).length * 2)
  assert.equal(report.totalBase, 0)
  assert.equal(report.totalVat, 0)
})

test('a full-month selection still works and leaves the saved records unchanged', () => {
  const before = structuredClone(days)
  const month = buildSalesTaxReport(config, days, period('2026-10-01', today), today)
  const saved = buildSalesTaxReport(config, days, period('2026-10-01', '2026-10-03'), today)
  assert.equal(month.totalBase, saved.totalBase)
  assert.equal(month.totalVat, saved.totalVat)
  assert.equal(month.lines.length, salesTaxGroups(config).length * 19)
  assert.deepEqual(days, before)
})

test('invalid, reversed, cross-month, future, and expired periods are rejected', () => {
  const invalid: unknown[] = [
    null,
    '2026-10',
    { month: '2026-10', startDate: '2026-10-02' },
    period('2026-10-03', '2026-10-02'),
    period('2026-09-30', '2026-10-01'),
    period('2026-10-19', '2026-10-20'),
    period('2026-07-31', '2026-07-31'),
    period('2026-10-31', '2026-10-32'),
    period('2026-13-01', '2026-13-01'),
    { month: '2026-09', startDate: '2026-10-01', endDate: '2026-10-02' }
  ]
  for (const value of invalid) assert.equal(isSalesTaxPeriod(value, today), false, JSON.stringify(value))
  assert.throws(() => buildSalesTaxReport(config, days, period('2026-10-03', '2026-10-02'), today))
})

test('calendar dates handle leap days correctly', () => {
  assert.equal(isSalesTaxPeriod(period('2024-02-29', '2024-02-29'), '2024-03-01'), true)
  assert.equal(isSalesTaxPeriod(period('2025-02-29', '2025-02-29'), '2025-03-01'), false)
  assert.equal(isSalesTaxPeriod(period('2026-09-31', '2026-09-31'), today), false)
})
