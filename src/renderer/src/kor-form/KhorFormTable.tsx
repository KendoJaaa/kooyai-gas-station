import type { JSX } from 'react'
import type { DeliveryNote, KhorTankSheet } from '../../../shared/reports'
import { DecimalInput } from './DecimalInput'
import { formatMeter } from './numbers'

export interface KhorFormTableProps {
  sheets: KhorTankSheet[]
  deliveries: DeliveryNote[]
  stickDrafts?: Record<string, string>
  startDrafts?: Record<string, string>
  editable?: boolean
  onStickChange?: (tankId: string, text: string) => void
  onStartChange?: (tankId: string, text: string) => void
  onDeliveryChange?: (index: number, patch: Partial<DeliveryNote>) => void
  onDeliveryLitersChange?: (index: number, tankId: string, text: string) => void
  fieldErrors?: Record<string, string>
}

const MOVEMENT_ROWS: {
  id: string
  key: keyof Pick<
    KhorTankSheet,
    | 'actualEnd'
    | 'actualStart'
    | 'received'
    | 'sold'
    | 'testLiters'
    | 'book'
    | 'variance'
    | 'varianceBrought'
    | 'varianceCarry'
  >
  label: string
  indent?: boolean
  editable?: 'end' | 'start'
}[] = [
  { id: 'cumulativeEnd', key: 'actualEnd', label: '1. ยอดน้ำมันสะสมในถังน้ำมันเชื้อเพลิงที่วัดได้จริงสิ้นงวด' },
  { id: 'actualEnd', key: 'actualEnd', label: '2. ยอดน้ำมันที่วัดได้จริงสิ้นงวด' },
  { id: 'actualStart', key: 'actualStart', label: '3. ยอดน้ำมันที่วัดได้จริงต้นงวด', editable: 'start' },
  { id: 'received', key: 'received', label: '4. บวกยอดน้ำมันรับประจำวัน' },
  { id: 'sold', key: 'sold', label: '5. หักยอดขายน้ำมันประจำวัน' },
  { id: 'testLiters', key: 'testLiters', label: 'หักทดสอบน้ำมัน', indent: true },
  { id: 'book', key: 'book', label: '6. น้ำมันคงเหลือในบัญชี (3+4-5)' },
  { id: 'variance', key: 'variance', label: '7. ผลต่างน้ำมันปัจจุบัน (2-6)' },
  { id: 'varianceBrought', key: 'varianceBrought', label: '8. บวกผลต่างสะสมยกมา' },
  { id: 'varianceCarry', key: 'varianceCarry', label: '9. ผลต่างสะสมปัจจุบันยกไป (7+8)' }
]

export function KhorFormTable({
  sheets,
  deliveries,
  stickDrafts = {},
  startDrafts = {},
  editable = false,
  onStickChange,
  onStartChange,
  onDeliveryChange,
  onDeliveryLitersChange,
  fieldErrors = {}
}: KhorFormTableProps): JSX.Element {
  const printDeliveries =
    deliveries.length > 0
      ? deliveries
      : [{ seq: 1, number: '', date: '', wholesaler: '', issuer: '', litersByFuel: {}, litersByTank: {} }]

  return (
    <>
      <table className="kor-table khor-table">
        <thead>
          <tr>
            <th className="khor-th-label">รายการ</th>
            {sheets.map((sheet) => (
              <th key={sheet.tank.id} className="kor-th-fuel">
                ถังที่ {sheet.tank.tankNo}
                <br />
                {sheet.fuel.nameTh}
                <br />
                หัว {sheet.nozzleLabel || '—'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOVEMENT_ROWS.map((row) => (
            <tr key={row.id} className="kor-row-summary">
              <td className={row.indent ? 'kor-td-summary kor-td-summary--indent' : 'kor-td-summary'}>
                {row.label}
              </td>
              {sheets.map((sheet) => (
                <td key={sheet.tank.id} className="kor-num khor-td">
                  <MovementCell
                    sheet={sheet}
                    row={row}
                    stickDraft={stickDrafts[sheet.tank.id]}
                    startDraft={startDrafts[sheet.tank.id]}
                    editable={editable}
                    invalidEnd={Boolean(fieldErrors[`stick:${sheet.tank.id}`])}
                    invalidStart={Boolean(fieldErrors[`start:${sheet.tank.id}`])}
                    onStickChange={onStickChange}
                    onStartChange={onStartChange}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="khor-delivery-title">ใบจ่ายน้ำมัน / ใบกำกับภาษีขนส่งน้ำมัน</div>
      <table className="kor-table khor-delivery-table">
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>เลขที่ใบจ่ายน้ำมัน</th>
            <th>วันที่</th>
            <th>คลังน้ำมันผู้ขายส่ง</th>
            <th>ชื่อผู้จ่ายน้ำมัน</th>
            {sheets.map((sheet) => (
              <th key={sheet.tank.id}>{sheet.fuel.nameTh}<br />ถัง {sheet.tank.tankNo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {printDeliveries.map((note, index) => (
            <tr key={`${note.seq}-${index}`}>
              <td className="kor-td-idx">{note.seq || index + 1}</td>
              <DeliveryText
                editable={editable}
                value={note.number}
                onChange={(text) => onDeliveryChange?.(index, { number: text })}
              />
              <DeliveryText
                editable={editable}
                value={note.date}
                onChange={(text) => onDeliveryChange?.(index, { date: text })}
              />
              <DeliveryText
                editable={editable}
                value={note.wholesaler}
                onChange={(text) => onDeliveryChange?.(index, { wholesaler: text })}
              />
              <DeliveryText
                editable={editable}
                value={note.issuer}
                onChange={(text) => onDeliveryChange?.(index, { issuer: text })}
              />
              {sheets.map((sheet) => (
                <td key={sheet.tank.id} className="kor-num kor-td-end">
                  {editable ? (
                    <DecimalInput
                      className="kor-input"
                      value={note.litersByTank?.[sheet.tank.id] || null}
                      onCommit={(parsed) =>
                        onDeliveryLitersChange?.(index, sheet.tank.id, parsed == null ? '' : String(parsed))
                      }
                      ariaLabel={`${sheet.fuel.nameTh} ถังที่ ${sheet.tank.tankNo} ยอดรับ`}
                    />
                  ) : (
                    formatMeter(note.litersByTank?.[sheet.tank.id] || null)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function MovementCell({
  sheet,
  row,
  startDraft,
  editable,
  invalidStart,
  onStartChange
}: {
  sheet: KhorTankSheet
  row: (typeof MOVEMENT_ROWS)[number]
  stickDraft?: string
  startDraft?: string
  editable: boolean
  invalidEnd: boolean
  invalidStart: boolean
  onStickChange?: (tankId: string, text: string) => void
  onStartChange?: (tankId: string, text: string) => void
}): JSX.Element | string {
  const value = sheet[row.key]

  if (editable && row.editable === 'start' && sheet.startEditable) {
    const inputValue = startDraft ?? (sheet.actualStart == null ? '' : String(sheet.actualStart))
    return (
      <input
        className={invalidStart ? 'kor-input kor-input--invalid' : 'kor-input'}
        inputMode="decimal"
        value={inputValue}
        onChange={(event) => onStartChange?.(sheet.tank.id, event.target.value)}
        aria-label={`ปริมาณน้ำมันต้นงวด ถังที่ ${sheet.tank.tankNo}`}
        aria-invalid={invalidStart}
      />
    )
  }

  if (row.key === 'received' || row.key === 'sold' || row.key === 'testLiters' || row.key === 'varianceBrought') {
    return formatMeter(typeof value === 'number' ? value : 0)
  }

  return formatMeter(typeof value === 'number' ? value : null)
}

function DeliveryText({
  editable,
  value,
  onChange
}: {
  editable: boolean
  value: string
  onChange: (text: string) => void
}): JSX.Element {
  return (
    <td className={editable ? 'kor-td-end' : undefined}>
      {editable ? (
        <input className="kor-input kor-input--text" value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        value
      )}
    </td>
  )
}
