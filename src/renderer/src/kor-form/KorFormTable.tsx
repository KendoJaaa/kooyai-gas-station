import type { JSX } from 'react'
import type { KorFuelSheet } from '../../../shared/reports'
import {
  machineAt,
  machineDay,
  rowCount,
  sortedFuelTypes,
  type DayReadings,
  type Machine,
  type StationConfig
} from '../../../shared/station'
import { formatBaht, formatMeter, formatPrice } from './numbers'

const SUB_HEADERS: { label: string; wrap?: [string, string] }[] = [
  { label: 'มิเตอร์เริ่มต้น', wrap: ['มิเตอร์', 'เริ่มต้น'] },
  { label: 'มิเตอร์สิ้นสุด', wrap: ['มิเตอร์', 'สิ้นสุด'] },
  { label: 'ปริมาณขาย(ลิตร)', wrap: ['ปริมาณ', 'ขาย(ลิตร)'] },
  { label: 'บาท' }
]

const SUB_COL_COUNT = SUB_HEADERS.length

export interface KorFormTableProps {
  config: StationConfig
  date: string
  history: Record<string, DayReadings>
  todayReadings: DayReadings
  sheets: KorFuelSheet[]
  endingDrafts?: Record<string, string>
  priceDrafts?: Record<string, string>
  editable?: boolean
  onEndingChange?: (machine: Machine, text: string) => void
  onPriceChange?: (fuelTypeId: string, text: string) => void
  fieldErrors?: Record<string, string>
}

function EmptyFuelCells(): JSX.Element {
  return (
    <>
      <td className="kor-td-empty"> </td>
      <td className="kor-td-empty"> </td>
      <td className="kor-td-empty"> </td>
      <td className="kor-td-empty"> </td>
    </>
  )
}

export function KorFormTable({
  config,
  date,
  history,
  todayReadings,
  sheets,
  endingDrafts = {},
  priceDrafts = {},
  editable = false,
  onEndingChange,
  onPriceChange,
  fieldErrors = {}
}: KorFormTableProps): JSX.Element {
  const fuels = sortedFuelTypes(config)
  const rows = rowCount(config)
  const sheetByFuel = new Map(sheets.map((sheet) => [sheet.fuel.id, sheet]))

  return (
    <table className="kor-table">
      <colgroup>
        <col className="kor-col-idx" />
        {fuels.flatMap((fuel) =>
          SUB_HEADERS.map((_col, colIndex) => (
            <col key={`${fuel.id}-${colIndex}`} className="kor-col-metric" />
          ))
        )}
      </colgroup>
      <thead>
        <tr>
          <th className="kor-th-idx" rowSpan={2}>
            หัวจ่าย
          </th>
          {fuels.map((fuel) => (
            <th key={fuel.id} className="kor-th-fuel" colSpan={SUB_COL_COUNT}>
              {fuel.nameTh}
            </th>
          ))}
        </tr>
        <tr>
          {fuels.map((fuel) =>
            SUB_HEADERS.map((col, colIndex) => (
              <th key={`${fuel.id}-${colIndex}`} className="kor-th-sub">
                {col.wrap ? (
                  <>
                    {col.wrap[0]}
                    <br />
                    {col.wrap[1]}
                  </>
                ) : (
                  col.label
                )}
              </th>
            ))
          )}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, index) => {
          const row = index + 1
          return (
            <tr key={row}>
              <td className="kor-td-idx">{row}</td>
              {fuels.map((fuel) => {
                const machine = machineAt(config, fuel.id, row)
                if (!machine) {
                  return <EmptyFuelCells key={fuel.id} />
                }

                const sheet = sheetByFuel.get(fuel.id)
                const price = sheet?.fuel.pricePerLiter ?? fuel.pricePerLiter
                const day = machineDay(machine, date, history, price, todayReadings)
                return (
                  <FuelCells
                    key={fuel.id}
                    day={day}
                    draft={endingDrafts[machine.id]}
                    editable={editable}
                    invalid={Boolean(fieldErrors[`meter:${machine.id}`])}
                    onEndingChange={onEndingChange}
                  />
                )
              })}
            </tr>
          )
        })}

        <tr className="kor-row-summary">
          <td className="kor-td-summary">1. รวม</td>
          {fuels.map((fuel) => {
            const sheet = sheetByFuel.get(fuel.id)
            return (
              <FuelAmountCells
                key={fuel.id}
                liters={sheet?.gross.liters ?? 0}
                baht={sheet?.gross.baht ?? 0}
              />
            )
          })}
        </tr>

        <tr className="kor-row-summary">
          <td className="kor-td-summary">2. หักทดสอบน้ำมัน</td>
          {fuels.map((fuel) => {
            const sheet = sheetByFuel.get(fuel.id)
            return (
              <FuelAmountCells
                key={fuel.id}
                liters={sheet?.testLiters ?? 0}
                baht={sheet?.testBaht ?? 0}
              />
            )
          })}
        </tr>

        <tr className="kor-row-summary">
          <td className="kor-td-summary kor-td-summary--indent">หักอื่นๆ (ระบุ) น้ำมันใช้เอง</td>
          {fuels.map((fuel) => {
            const sheet = sheetByFuel.get(fuel.id)
            return (
              <FuelAmountCells
                key={fuel.id}
                liters={sheet?.ownUseLiters ?? 0}
                baht={sheet?.ownUseBaht ?? 0}
              />
            )
          })}
        </tr>

        <tr className="kor-row-summary">
          <td className="kor-td-summary">3. รวมยอดขายประจำวัน (1-2)</td>
          {fuels.map((fuel) => {
            const sheet = sheetByFuel.get(fuel.id)
            return (
              <FuelAmountCells
                key={fuel.id}
                liters={sheet?.dailySales.liters ?? 0}
                baht={sheet?.dailySales.baht ?? 0}
              />
            )
          })}
        </tr>

        <tr className="kor-row-summary">
          <td className="kor-td-summary">4. หักส่วนลดการค้า</td>
          {fuels.map((fuel) => {
            const sheet = sheetByFuel.get(fuel.id)
            return <FuelAmountCells key={fuel.id} bahtOnly baht={sheet?.tradeDiscountBaht ?? 0} />
          })}
        </tr>

        <tr className="kor-row-summary">
          <td className="kor-td-summary kor-td-summary--indent">
            หักส่วนลดการค้าอื่นๆ (ระบุ) เงินเชื่อ
          </td>
          {fuels.map((fuel) => {
            const sheet = sheetByFuel.get(fuel.id)
            return <FuelAmountCells key={fuel.id} bahtOnly baht={sheet?.creditDiscountBaht ?? 0} />
          })}
        </tr>

        <tr className="kor-row-summary">
          <td className="kor-td-summary">5. ยอดขายสุทธิ (3-4)</td>
          {fuels.map((fuel) => {
            const sheet = sheetByFuel.get(fuel.id)
            return (
              <FuelAmountCells
                key={fuel.id}
                liters={sheet?.netLiters ?? 0}
                baht={sheet?.netBaht ?? 0}
              />
            )
          })}
        </tr>

        <tr className="kor-row-summary">
          <td className="kor-td-summary">6. ภาษีขายสุทธิ ((5)*7/107)</td>
          {fuels.map((fuel) => {
            const sheet = sheetByFuel.get(fuel.id)
            return <FuelAmountCells key={fuel.id} bahtOnly baht={sheet?.outputVat ?? 0} />
          })}
        </tr>

        <tr className="kor-row-summary">
          <td className="kor-td-summary">7. ภาษีซื้อ</td>
          {fuels.map((fuel) => {
            const sheet = sheetByFuel.get(fuel.id)
            return <FuelAmountCells key={fuel.id} bahtOnly baht={sheet?.inputVat ?? 0} />
          })}
        </tr>

        <tr className="kor-row-price">
          <td className="kor-td-summary">ราคาน้ำมัน</td>
          {fuels.map((fuel) => {
            const sheet = sheetByFuel.get(fuel.id)
            const price = sheet?.fuel.pricePerLiter ?? fuel.pricePerLiter
            const draft = priceDrafts[fuel.id]
            return (
              <td key={fuel.id} colSpan={SUB_COL_COUNT} className="kor-td-price">
                {fuel.nameTh}{' '}
                {editable ? (
                  <input
                    className={
                      fieldErrors[`price:${fuel.id}`] ? 'kor-input kor-input-price kor-input--invalid' : 'kor-input kor-input-price'
                    }
                    inputMode="decimal"
                    value={draft ?? (price ? String(price) : '')}
                    onChange={(event) => onPriceChange?.(fuel.id, event.target.value)}
                    aria-label={`ราคาน้ำมัน ${fuel.nameTh}`}
                    aria-invalid={Boolean(fieldErrors[`price:${fuel.id}`])}
                  />
                ) : (
                  formatPrice(price)
                )}{' '}
                บาท
              </td>
            )
          })}
        </tr>
      </tbody>
    </table>
  )
}

function FuelCells({
  day,
  draft,
  editable,
  invalid,
  onEndingChange
}: {
  day: ReturnType<typeof machineDay>
  draft?: string
  editable: boolean
  invalid: boolean
  onEndingChange?: (machine: Machine, text: string) => void
}): JSX.Element {
  const inputValue = draft ?? (day.end == null ? '' : String(day.end))

  return (
    <>
      <td className="kor-num">{formatMeter(day.start)}</td>
      <td className="kor-num kor-td-end">
        {editable ? (
          <input
            className={invalid ? 'kor-input kor-input--invalid' : 'kor-input'}
            inputMode="decimal"
            value={inputValue}
            onChange={(event) => onEndingChange?.(day.machine, event.target.value)}
            aria-label={`มิเตอร์สิ้นสุด หัวจ่าย ${day.machine.nozzleNo}`}
            aria-invalid={invalid}
          />
        ) : (
          formatMeter(day.end)
        )}
      </td>
      <td className="kor-num">{formatMeter(day.liters)}</td>
      <td className="kor-num">{formatBaht(day.baht)}</td>
    </>
  )
}

function FuelAmountCells({
  liters,
  baht,
  bahtOnly = false
}: {
  liters?: number | null
  baht: number | null
  bahtOnly?: boolean
}): JSX.Element {
  return (
    <>
      <td className="kor-td-empty"> </td>
      <td className="kor-td-empty"> </td>
      <td className={bahtOnly ? 'kor-td-empty' : 'kor-num kor-td-total'}>
        {bahtOnly ? ' ' : formatMeter(liters)}
      </td>
      <td className="kor-num kor-td-total">{formatBaht(baht)}</td>
    </>
  )
}
