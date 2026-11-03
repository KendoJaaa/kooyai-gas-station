import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const { MantineProvider } = require('@mantine/core')

const bundle = await build({
  stdin: {
    contents: "export * from './src/shared/reports'; export { DEFAULT_STATION, unusedNozzleMeters } from './src/shared/station'; export { emptyStore, completeSetup, withDay } from './src/shared/store'; export { validateDailyForm } from './src/renderer/src/kor-form/validateDaily'",
    resolveDir: process.cwd()
  },
  bundle: true, platform: 'node', format: 'esm', write: false
})
const { emptyDay, khorSheets, korSheets, meterHistory, DEFAULT_STATION, unusedNozzleMeters, emptyStore, completeSetup, withDay, validateDailyForm } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
)

const uiBundle = await build({
  stdin: {
    contents: "export { KhorFormPage } from './src/renderer/src/kor-form/KhorFormPage'; export { DailyCloseSheet } from './src/renderer/src/DailyCloseSheet'; export { StationConfigEditor } from './src/renderer/src/StationConfigEditor'",
    resolveDir: process.cwd()
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  jsx: 'automatic', loader: { '.css': 'empty' }
})
const uiModule = { exports: {} }
runInNewContext(uiBundle.outputFiles[0].text, {
  module: uiModule, exports: uiModule.exports, require
})
const { KhorFormPage, DailyCloseSheet, StationConfigEditor } = uiModule.exports

function fixture() {
  const config = structuredClone(DEFAULT_STATION)
  for (const machine of config.machines) machine.openingMeter = 0
  for (const tank of config.tanks) {
    tank.openingStock = 1_000
    tank.openingVariance = 75
  }
  return config
}

function reading(config, stock, varianceStart) {
  const day = emptyDay()
  day.tankSticks = Object.fromEntries(config.tanks.map((tank) => [tank.id, stock]))
  if (varianceStart !== undefined) {
    day.varianceStarts = Object.fromEntries(config.tanks.map((tank) => [tank.id, varianceStart]))
  }
  return day
}

test('row 8 resets on the first of the month despite saved carry values; row 9 equals today’s difference', () => {
  const config = fixture()
  const days = { '2026-10-31': reading(config, 1_020, 100) }
  const today = reading(config, 1_015, 120)
  const before = structuredClone({ config, days, today })
  for (const sheet of khorSheets(config, '2026-11-01', days, today)) {
    assert.equal(sheet.actualStart, 1_020, 'physical stock still carries across months')
    assert.equal(sheet.variance, -5)
    assert.equal(sheet.varianceBrought, 0)
    assert.equal(sheet.varianceCarry, -5)
    assert.equal(sheet.varianceBroughtEditable, false)
  }
  assert.deepEqual({ config, days, today }, before, 'calculations must not rewrite saved records')
})

test('later days ignore a stale first-day carry and accumulate only the current month', () => {
  const config = fixture()
  const days = {
    '2026-10-31': reading(config, 1_020, 100),
    '2026-11-01': reading(config, 1_015, 120),
    '2026-11-02': reading(config, 1_022)
  }
  for (const sheet of khorSheets(config, '2026-11-03', days, reading(config, 1_019))) {
    assert.equal(sheet.varianceBrought, 2, '-5 + 7 from November only')
    assert.equal(sheet.varianceCarry, -1, 'row 9 = row 7 + row 8')
    assert.equal(sheet.varianceBroughtEditable, false)
  }
})

test('a missing first-of-month entry cannot let an old manual carry-in contaminate the new month', () => {
  const config = fixture()
  const days = { '2026-10-31': reading(config, 1_020, 100) }
  const first = reading(config, 1_015, 120)
  const before = structuredClone({ config, days, first })
  for (const sheet of khorSheets(config, '2026-11-02', days, first)) {
    assert.equal(sheet.varianceBrought, 0)
    assert.equal(sheet.varianceCarry, -5)
    assert.equal(sheet.varianceBroughtEditable, false)
  }
  assert.deepEqual({ config, days, first }, before, 'ignore old carry-in without rewriting stored records')
  const saved = { ...days, '2026-11-02': first }
  for (const sheet of khorSheets(config, '2026-11-03', saved, reading(config, 1_018))) {
    assert.equal(sheet.varianceBrought, -5)
    assert.equal(sheet.varianceCarry, -2)
  }
})

test('the first day resets even on a new installation with a nonzero setup balance', () => {
  const config = fixture()
  for (const sheet of khorSheets(config, '2026-11-01', {}, reading(config, 1_010))) {
    assert.equal(sheet.varianceBrought, 0)
    assert.equal(sheet.varianceCarry, 10)
  }
})

test('the December to January boundary resets independently for all five tanks', () => {
  const config = fixture()
  const previous = reading(config, 1_000, 50)
  const today = reading(config, 1_000, 50)
  config.tanks.forEach((tank, index) => {
    today.tankSticks[tank.id] += index - 2
  })
  const sheets = khorSheets(config, '2027-01-01', { '2026-12-31': previous }, today)
  assert.deepEqual(sheets.map((sheet) => sheet.varianceBrought), [0, 0, 0, 0, 0])
  assert.deepEqual(sheets.map((sheet) => sheet.varianceCarry), [-2, -1, 0, 1, 2])
})

test('an initial mid-month paper balance remains available and carries through that month', () => {
  const config = fixture()
  const first = reading(config, 1_010, -25)
  const firstSheets = khorSheets(config, '2026-10-15', {}, first)
  assert.ok(firstSheets.every((sheet) => sheet.varianceBrought === -25 && sheet.varianceBroughtEditable))
  for (const sheet of khorSheets(config, '2026-10-16', { '2026-10-15': first }, reading(config, 1_012))) {
    assert.equal(sheet.varianceBrought, -15)
    assert.equal(sheet.varianceCarry, -13)
  }
})

test('a setup balance used for an initial mid-month day is not lost on the next day', () => {
  const config = fixture()
  const first = reading(config, 1_010)
  for (const sheet of khorSheets(config, '2026-10-16', { '2026-10-15': first }, reading(config, 1_012))) {
    assert.equal(sheet.varianceBrought, 85)
    assert.equal(sheet.varianceCarry, 87)
  }
})

test('setup mid-month → save/reopen → month-end → new month → following day keeps the intended balances', () => {
  const config = fixture()
  config.tanks.forEach((tank, index) => { tank.openingVariance = (index - 2) * 25 })
  let days = {}
  const sequence = [
    { date: '2026-10-15', stock: 1_010, brought: config.tanks.map((tank) => tank.openingVariance) },
    { date: '2026-10-16', stock: 1_007, brought: config.tanks.map((tank) => tank.openingVariance + 10) },
    { date: '2026-10-31', stock: 1_012, brought: config.tanks.map((tank) => tank.openingVariance + 7) },
    { date: '2026-11-01', stock: 1_008, brought: [0, 0, 0, 0, 0] },
    { date: '2026-11-02', stock: 1_014, brought: [-4, -4, -4, -4, -4] },
    { date: '2026-12-01', stock: 1_011, brought: [0, 0, 0, 0, 0] }
  ]
  for (const { date, stock, brought } of sequence) {
    const day = reading(config, stock)
    const sheets = khorSheets(config, date, days, day)
    assert.deepEqual(sheets.map((sheet) => sheet.varianceBrought), brought, date)
    for (const sheet of sheets) {
      assert.equal(sheet.varianceCarry, sheet.variance + sheet.varianceBrought, date)
    }
    // The company setup survives subsequent saves and reopening the app.
    days = JSON.parse(JSON.stringify({ ...days, [date]: day }))
    assert.deepEqual(khorSheets(config, date, days, days[date]).map((sheet) => sheet.varianceBrought), brought)
  }
})

test('a month with no earlier entries starts at zero without reusing setup or previous-month balances', () => {
  const config = fixture()
  const days = { '2026-09-30': reading(config, 1_030, 150) }
  for (const sheet of khorSheets(config, '2026-11-03', days, reading(config, 1_035))) {
    assert.equal(sheet.varianceBrought, 0)
    assert.equal(sheet.varianceCarry, 5)
  }
})

test('missing closing readings leave row 9 blank instead of inventing an accumulated result', () => {
  const config = fixture()
  for (const sheet of khorSheets(config, '2026-11-01', {}, emptyDay())) {
    assert.equal(sheet.varianceBrought, 0)
    assert.equal(sheet.variance, null)
    assert.equal(sheet.varianceCarry, null)
  }
})

test('editing previous closing stock recalculates this month without importing its accumulated balance', () => {
  const config = fixture()
  const days = {
    '2026-10-31': reading(config, 1_020, 100),
    '2026-11-01': reading(config, 1_015),
    '2026-11-02': reading(config, 1_022)
  }
  const today = reading(config, 1_019)
  const before = khorSheets(config, '2026-11-02', days, days['2026-11-02'])
  days['2026-10-31'] = reading(config, 1_030, 999)
  const after = khorSheets(config, '2026-11-02', days, days['2026-11-02'])
  assert.ok(before.every((sheet) => sheet.varianceBrought === -5))
  assert.ok(after.every((sheet) => sheet.varianceBrought === -15))
  assert.ok(khorSheets(config, '2026-11-03', days, today).every((sheet) => sheet.varianceCarry === -11))
})

test('the actual ส่วน ข report prints the monthly reset in row 8 and today’s difference in row 9', () => {
  const config = fixture()
  const html = renderToStaticMarkup(createElement(KhorFormPage, {
    config, date: '2026-11-01',
    days: { '2026-10-31': reading(config, 1_020, 100) },
    day: reading(config, 1_015, 120)
  }))
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1])
  for (const [label, expected] of [
    ['8. บวกผลต่างสะสมยกมา', '0.000'],
    ['9. ผลต่างสะสมปัจจุบันยกไป', '-5.000']
  ]) {
    const row = rows.find((value) => value.includes(label))
    assert.ok(row, label)
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1])
    assert.deepEqual(cells.slice(1), [expected, expected, expected, expected, expected])
  }
})

test('the daily screen never asks for the onboarding carry-in balance, including a new month with missing earlier entries', () => {
  const config = fixture()
  const props = {
    config, days: {}, day: emptyDay(), meterDrafts: {}, priceDrafts: {},
    stickDrafts: {}, startDrafts: {}, fieldErrors: {},
    onMeterChange() {}, onPriceChange() {}, onStickChange() {}, onStartChange() {}
  }
  for (const [date, days] of [
    ['2026-10-15', {}],
    ['2026-11-01', {}],
    ['2026-11-02', { '2026-10-31': reading(config, 1_010, 75) }],
    ['2026-11-03', { '2026-11-02': reading(config, 1_010, 75) }]
  ]) {
    const html = renderToStaticMarkup(createElement(MantineProvider, null,
      createElement(DailyCloseSheet, { ...props, date, days })))
    assert.doesNotMatch(html, /aria-label="ผลต่างสะสมยกมา ถังที่/, date)
    assert.doesNotMatch(html, /ผลต่างสะสมยกมา — เริ่มใช้กลางเดือน|ผลต่างสะสมยกมาของเดือนนี้แก้ได้ที่/, date)
    assert.match(html, /ผลต่างสะสมยกไป \(ลิตร\)/, 'calculated totals still appear')
  }
})

test('onboarding retains the opening balance inputs and supplies the first partial month automatically', () => {
  const config = fixture()
  const editor = renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(StationConfigEditor, {
      config, onChange() {}, showFuels: false, showMachines: false, showTanks: true, simpleMode: true
    })))
  assert.match(editor, /ผลต่างสะสมยกมา \(ลิตร\)/)
  assert.equal([...editor.matchAll(/value="75"/g)].length, config.tanks.length)

  const initial = emptyStore('2026-10-15')
  let store = completeSetup(initial, initial.identity, config)
  store = JSON.parse(JSON.stringify(store))
  assert.equal(store.setupCompleted, true)
  const first = reading(config, 1_010)
  assert.ok(khorSheets(store.config, '2026-10-15', store.days, first).every(sheet => sheet.varianceBrought === 75 && sheet.varianceCarry === 85))
  store = withDay(store, '2026-10-15', first)
  assert.ok(khorSheets(store.config, '2026-10-16', store.days, reading(config, 1_012)).every(sheet => sheet.varianceBrought === 85 && sheet.varianceCarry === 87))
  // The first recorded day of the next month can be later than the first.
  assert.ok(khorSheets(store.config, '2026-11-02', store.days, reading(config, 1_015)).every(sheet => sheet.varianceBrought === 0 && sheet.varianceCarry === 5))
})

test('re-saving a historical day preserves disabled-nozzle sales and the form gross total matches the report', () => {
  const initial = fixture()
  const tank = initial.tanks[0]
  const fuel = { ...initial.fuelTypes.find(item => item.id === tank.fuelTypeId), pricePerLiter: 35 }
  const machines = initial.machines.filter(machine => machine.tankId === tank.id)
  machines[1].inUse = false
  const config = { ...initial, layoutId: 'custom', tanks: [tank], fuelTypes: [fuel], machines }
  const day = { ...emptyDay(), meters: Object.fromEntries(machines.map(machine => [machine.id, 100])),
    prices: { [fuel.id]: 35 }, tankSticks: { [tank.id]: 800 } }
  const date = '2026-10-15'
  const days = { [date]: day }
  const meters = { ...day.meters, ...unusedNozzleMeters(config, date, meterHistory(days), day.meters) }
  assert.deepEqual(meters, day.meters)
  const saved = { ...day, meters }
  const gross = korSheets(config, date, days, saved)[0].gross
  assert.deepEqual(gross, { liters: 200, baht: 7000 })
  const html = renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(DailyCloseSheet, {
      config, date, days, day: saved,
      meterDrafts: Object.fromEntries(Object.entries(meters).map(([key, value]) => [key, String(value)])),
      priceDrafts: { [fuel.id]: '35' }, stickDrafts: { [tank.id]: '800' }, startDrafts: {}, fieldErrors: {},
      onMeterChange() {}, onPriceChange() {}, onStickChange() {}, onStartChange() {}
    }))).replace(/<!--.*?-->/g, '')
  assert.match(html, /เมื่อวานขาย 200\.000 ลิตร รวม 7,000\.00 บาท/)
  assert.match(html, /หยุดใช้แล้ว/)
  assert.doesNotMatch(html, new RegExp(`aria-label="มิเตอร์สิ้นสุด หัวจ่าย ${machines[1].nozzleNo}"`))
})

test('a disabled nozzle without a recorded ending reading is filled with its starting meter for zero sales', () => {
  const config = fixture()
  config.machines[0].inUse = false
  const id = config.machines[0].id
  const history = { '2026-10-14': { [id]: 125 } }
  assert.deepEqual(unusedNozzleMeters(config, '2026-10-15', history), { [id]: 125 })
  assert.deepEqual(unusedNozzleMeters(config, '2026-10-15', history, { [id]: 0 }), { [id]: 0 }, 'an explicit recorded zero is preserved')
})

test('recorded sales on a disabled nozzle still require a valid fuel price before PDF export', () => {
  const config = fixture()
  config.machines.forEach(machine => { machine.inUse = false })
  const machine = config.machines[0]
  const day = { ...emptyDay(), meters: { [machine.id]: 100 } }
  const issues = validateDailyForm(config, '2026-10-15', {}, day, {
    meters: {}, prices: {}, sticks: {}, starts: {}, broughts: {}
  })
  assert.ok(issues.some(issue => issue.key === `price:${machine.fuelTypeId}`))
})
