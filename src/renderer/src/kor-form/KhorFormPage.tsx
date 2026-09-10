import type { JSX } from 'react'
import { khorSheets, type DayRecord, type DeliveryNote } from '../../../shared/reports'
import type { StationConfig } from '../../../shared/station'
import { KorFormHeader } from './KorFormHeader'
import { KhorFormTable } from './KhorFormTable'
import { EMPTY_KOR_HEADER, type KorFormHeaderValues } from './sampleHeader'
import './kor-form.css'

export interface KhorFormPageProps {
  config: StationConfig
  date: string
  days: Record<string, DayRecord>
  day: DayRecord
  header?: KorFormHeaderValues
  editable?: boolean
  stickDrafts?: Record<string, string>
  startDrafts?: Record<string, string>
  onStickChange?: (tankId: string, text: string) => void
  onStartChange?: (tankId: string, text: string) => void
  onDeliveryChange?: (index: number, patch: Partial<DeliveryNote>) => void
  onDeliveryLitersChange?: (index: number, tankId: string, text: string) => void
  fieldErrors?: Record<string, string>
  page?: number
  pageCount?: number
}

export function KhorFormPage({
  config,
  date,
  days,
  day,
  header = EMPTY_KOR_HEADER,
  editable = false,
  stickDrafts,
  startDrafts,
  onStickChange,
  onStartChange,
  onDeliveryChange,
  onDeliveryLitersChange,
  fieldErrors,
  page = 1,
  pageCount = 1
}: KhorFormPageProps): JSX.Element {
  const sheets = khorSheets(config, date, days, day)

  return (
    <div className="kor-page">
      <KorFormHeader data={header} part="ส่วน ข." />
      <KhorFormTable
        sheets={sheets}
        deliveries={day.deliveries}
        stickDrafts={stickDrafts}
        startDrafts={startDrafts}
        editable={editable}
        onStickChange={onStickChange}
        onStartChange={onStartChange}
        onDeliveryChange={onDeliveryChange}
        onDeliveryLitersChange={onDeliveryLitersChange}
        fieldErrors={fieldErrors}
      />
      <footer className="kor-footer">
        <span>rpt_vat_sec_b</span>
        <span>
          หน้า : {page} / {pageCount}
        </span>
      </footer>
    </div>
  )
}
