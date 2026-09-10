import type { JSX } from 'react'
import {
  invoiceTotals,
  korGrandTotals,
  korSheets,
  type DayRecord,
  type TaxInvoiceLine
} from '../../../shared/reports'
import type { StationConfig } from '../../../shared/station'
import { formatBaht } from './numbers'
import { KorFormHeader } from './KorFormHeader'
import { EMPTY_KOR_HEADER, type KorFormHeaderValues } from './sampleHeader'

export interface KorInvoicePageProps {
  config: StationConfig
  date: string
  days: Record<string, DayRecord>
  day: DayRecord
  header?: KorFormHeaderValues
  page?: number
  pageCount?: number
}

export function KorInvoicePage({
  config,
  date,
  days,
  day,
  header = EMPTY_KOR_HEADER,
  page = 1,
  pageCount = 1
}: KorInvoicePageProps): JSX.Element {
  const grand = korGrandTotals(korSheets(config, date, days, day))
  const full = invoiceTotals(day.fullInvoices)
  const short = invoiceTotals(day.shortInvoices)

  return (
    <div className="kor-page">
      <KorFormHeader data={header} part="ส่วน ก." />

      <div className="kor-vat-summary">
        <div>
          รวมภาษีขายสุทธิ <strong>{formatBaht(grand.outputVat)}</strong>
        </div>
        <div>
          รวมภาษีซื้อ <strong>{formatBaht(grand.inputVat)}</strong>
        </div>
      </div>

      <InvoiceBlock
        title="รายการใบกำกับภาษีเต็มรูป ตามมาตรา 86/4"
        lines={day.fullInvoices}
        totals={full}
      />
      <InvoiceBlock
        title="รายการใบกำกับภาษีอย่างย่อ ตามมาตรา 86/6"
        lines={day.shortInvoices}
        totals={short}
      />

      <footer className="kor-footer">
        <span>rpt_vat_sec_a</span>
        <span>
          หน้า : {page} / {pageCount}
        </span>
      </footer>
    </div>
  )
}

function InvoiceBlock({
  title,
  lines,
  totals
}: {
  title: string
  lines: TaxInvoiceLine[]
  totals: { amount: number; vat: number; count: number }
}): JSX.Element {
  const rows = lines.length > 0 ? lines : [{ bookNo: '', fromNo: '', toNo: '', count: 0, amount: 0, vat: 0 }]

  return (
    <section className="kor-invoice">
      <div className="kor-invoice__title">{title}</div>
      <table className="kor-table kor-invoice-table">
        <thead>
          <tr>
            <th>เล่มที่</th>
            <th>จากเลขที่</th>
            <th>ถึงเลขที่</th>
            <th>จำนวนฉบับ</th>
            <th>มูลค่าสินค้า</th>
            <th>ภาษีมูลค่าเพิ่ม</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line, index) => (
            <tr key={`${line.bookNo}-${line.fromNo}-${index}`}>
              <td>{line.bookNo}</td>
              <td>{line.fromNo}</td>
              <td>{line.toNo}</td>
              <td className="kor-num">{line.count ? line.count : ''}</td>
              <td className="kor-num">{line.amount ? formatBaht(line.amount) : ''}</td>
              <td className="kor-num">{line.vat ? formatBaht(line.vat) : ''}</td>
            </tr>
          ))}
          <tr className="kor-row-summary">
            <td colSpan={3} className="kor-td-summary">
              รวม
            </td>
            <td className="kor-num kor-td-total">{totals.count || ''}</td>
            <td className="kor-num kor-td-total">{formatBaht(totals.amount)}</td>
            <td className="kor-num kor-td-total">{formatBaht(totals.vat)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
