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
  page?: number
  pageCount?: number
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
  fieldErrors,
  page = 1,
  pageCount = 1
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
      <footer className="kor-footer">
        <span>rpt_vat_sec_a</span>
        <span>
          หน้า : {page} / {pageCount}
        </span>
      </footer>
    </div>
  )
}
