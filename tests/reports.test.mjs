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
    contents: "export * from './src/shared/reports'; export { DEFAULT_STATION } from './src/shared/station'",
    resolveDir: process.cwd()
  },
  bundle: true, platform: 'node', format: 'esm', write: false
})
const { emptyDay, khorSheets, DEFAULT_STATION } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
)

const uiBundle = await build({
  stdin: {
    contents: "export { KhorFormPage } from './src/renderer/src/kor-form/KhorFormPage'; export { DailyCloseSheet } from './src/renderer/src/DailyCloseSheet'",
    resolveDir: process.cwd()
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  jsx: 'automatic', loader: { '.css': 'empty' }
})
const uiModule = { exports: {} }
runInNewContext(uiBundle.outputFiles[0].text, {
  module: uiModule, exports: uiModule.exports, require
})
const { KhorFormPage, DailyCloseSheet } = uiModule.exports

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

test('the daily screen offers paper carry-in for the first partial month, but not on the first of a month', () => {
  const config = fixture()
  const props = {
    config, days: {}, day: emptyDay(), meterDrafts: {}, priceDrafts: {},
    stickDrafts: {}, startDrafts: {}, broughtDrafts: {}, fieldErrors: {},
    onMeterChange() {}, onPriceChange() {}, onStickChange() {}, onStartChange() {}, onBroughtChange() {}
  }
  const render = (date) => renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(DailyCloseSheet, { ...props, date })))
  assert.match(render('2026-10-15'), /aria-label="ผลต่างสะสมยกมา ถังที่/)
  assert.doesNotMatch(render('2026-11-01'), /aria-label="ผลต่างสะสมยกมา ถังที่/)
  assert.match(render('2026-11-01'), /ผลต่างสะสมยกมาเริ่มที่ 0 ทุกต้นเดือน/)
})
