import type { JSX } from 'react'
import { korGrandTotals, korSheets, meterHistory, type DayRecord } from '../../../shared/reports'
import type { Machine, StationConfig } from '../../../shared/station'
import { formatBaht } from './numbers'
import { KorFormHeader } from './KorFormHeader'
import { KorFormTable } from './KorFormTable'
import { EMPTY_KOR_HEADER, type KorFormHeaderValues } from './sampleHeader'
import './kor-form.css'

export interface KorFormPageProps {
  config: StationConfig
  date: string
  days: Record<string, DayRecord>
  day: DayRecord
  endingDrafts?: Record<string, string>
  priceDrafts?: Record<string, string>
  header?: KorFormHeaderValues
  editable?: boolean
  onEndingChange?: (machine: Machine, text: string) => void
  onPriceChange?: (fuelTypeId: string, text: string) => void
  fieldErrors?: Record<string, string>
}

export function KorFormPage({
  config,
  date,
  days,
  day,
  endingDrafts,
  priceDrafts,
  header = EMPTY_KOR_HEADER,
  editable = false,
  onEndingChange,
  onPriceChange,
  fieldErrors
}: KorFormPageProps): JSX.Element {
  const sheets = korSheets(config, date, days, day)
  const grand = korGrandTotals(sheets)

  return (
    <div className="kor-page">
      <KorFormHeader data={header} part="ส่วน ก." />
      <KorFormTable
        config={config}
        date={date}
        history={meterHistory(days)}
        todayReadings={day.meters}
        sheets={sheets}
        endingDrafts={endingDrafts}
        priceDrafts={priceDrafts}
        editable={editable}
        onEndingChange={onEndingChange}
        onPriceChange={onPriceChange}
        fieldErrors={fieldErrors}
      />
      <div className="kor-vat-bar">
        <span>รวมภาษีขายสุทธิ {formatBaht(grand.outputVat)}</span>
        <span>รวมภาษีซื้อ {formatBaht(grand.inputVat)}</span>
      </div>
      <HandwritingLines />
    </div>
  )
}

const HAND_COLUMNS = [
  'เล่มที่',
  'เลขที่',
  'ถึงเลขที่',
  'จำนวน',
  'ฉบับ',
  'ต้นทุนเงิน',
  'บาท',
  'ภาษีมูลค่าเพิ่ม',
  'บาท',
  'ภาษีมูลค่าซื้อ',
  'บาท'
] as const

const HAND_ROWS = 8

function HandwritingLines(): JSX.Element {
  return (
    <table className="kor-table kor-hand">
      <thead>
        <tr>
          {HAND_COLUMNS.map((label, index) => (
            <th key={`${label}-${index}`}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: HAND_ROWS }, (_, row) => (
          <tr key={row}>
            {HAND_COLUMNS.map((label, index) => (
              <td key={`${label}-${index}`} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
