import { useEffect, useState, type JSX } from 'react'
import { Center, Loader, Text } from '@mantine/core'
import dayjs from 'dayjs'
import { buildSalesTaxReport, type SalesTaxLine } from '../../shared/salesTax'
import { emptyStore, isAppStore, migrateStore, type AppStore } from '../../shared/store'
import { isoToday } from './kor-form/dates'
import { formatBaht } from './kor-form/numbers'
import './sales-tax.css'

function monthFromLocation(): string {
  const month = new URLSearchParams(window.location.search).get('month') ?? ''
  return /^\d{4}-\d{2}$/.test(month) ? month : dayjs().format('YYYY-MM')
}

function amountText(value: number): string {
  if (!value) return '—'
  return formatBaht(value)
}

export function SalesTaxPrint(): JSX.Element {
  const [store, setStore] = useState<AppStore | null>(null)
  const [error, setError] = useState<string | null>(null)
  const month = monthFromLocation()

  useEffect(() => {
    let cancelled = false

    if (!window.api) {
      setStore(emptyStore(isoToday()))
      return
    }

    window.api
      .loadStore()
      .then((loaded) => {
        if (cancelled) return
        setStore(loaded && isAppStore(loaded) ? migrateStore(loaded) : emptyStore(isoToday()))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ')
        setStore(emptyStore(isoToday()))
      })
      .finally(() => {
        window.setTimeout(() => window.api?.notifyPrintReady(), 50)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!store) {
    return (
      <Center h="100vh">
        <Loader color="teal" />
      </Center>
    )
  }

  const report = buildSalesTaxReport(store.config, store.days, month, isoToday())
  const identity = store.identity
  const headquarters = identity.branch.trim() === '' || identity.branch.includes('สำนักงานใหญ่')
  const monthLabel = dayjs(`${month}-01`).format('MMMM BBBB')
  const taxDigits = identity.taxId.replace(/\D/g, '').slice(0, 13).split('')

  return (
    <div className="sales-tax-sheet">
      {error ? (
        <Text c="red" mb="sm">
          {error}
        </Text>
      ) : null}
      <div className="sales-tax-head">
        <h1 className="sales-tax-title">รายงานภาษีขาย</h1>
        <div className="sales-tax-month">เดือนภาษี {monthLabel}</div>
      </div>
      <div>ชื่อผู้ประกอบการ {identity.operatorName}</div>
      <div className="sales-tax-id">
        <span>เลขประจำตัวผู้เสียภาษีอากร</span>
        <span className="sales-tax-digits">
          {taxDigits.map((digit, index) => (
            <span key={`${digit}-${index}`}>{digit}</span>
          ))}
        </span>
      </div>
      <div>ชื่อสถานประกอบการ {identity.stationName}</div>
      <div>
        <span className="sales-tax-check">{headquarters ? '✓' : ''}</span>
        สำนักงานใหญ่
        <span style={{ display: 'inline-block', width: 16 }} />
        <span className="sales-tax-check">{headquarters ? '' : '✓'}</span>
        สาขาที่ {headquarters ? '' : identity.branch}
      </div>
      <table className="sales-tax-table">
        <colgroup>
          <col style={{ width: '6%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>ลำดับที่</th>
            <th colSpan={2}>ใบกำกับภาษี</th>
            <th rowSpan={2}>ชื่อผู้ซื้อสินค้า/ผู้รับบริการ</th>
            <th rowSpan={2}>เลขประจำตัวผู้เสียภาษีอากรของผู้ซื้อสินค้า/ผู้รับบริการ</th>
            <th colSpan={2}>สถานประกอบการ</th>
            <th rowSpan={2}>มูลค่าสินค้าหรือบริการ</th>
            <th rowSpan={2}>จำนวนเงินภาษีมูลค่าเพิ่ม</th>
          </tr>
          <tr>
            <th>วัน เดือน ปี</th>
            <th>เลขที่/เล่มที่</th>
            <th>สำนักงานใหญ่</th>
            <th>สาขาที่</th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map((line) => (
            <TaxRow key={`${line.date}-${line.nozzles}-${line.fuelCode}`} line={line} />
          ))}
          <tr className="sales-tax-total">
            <td colSpan={7} className="sales-tax-center">
              รวม
            </td>
            <td className="sales-tax-num">{formatBaht(report.totalBase)}</td>
            <td className="sales-tax-num">{formatBaht(report.totalVat)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function TaxRow({ line }: { line: SalesTaxLine }): JSX.Element {
  const when = dayjs(line.date).format('D/M')
  return (
    <tr>
      <td className="sales-tax-center">{line.firstOfDay ? line.dayNo : ''}</td>
      <td className="sales-tax-center">{line.firstOfDay ? when : ''}</td>
      <td />
      <td>
        {line.nozzles} {line.fuelCode}
      </td>
      <td className="sales-tax-center">—</td>
      <td className="sales-tax-center">—</td>
      <td className="sales-tax-center">—</td>
      <td className="sales-tax-num">{amountText(line.baseBaht)}</td>
      <td className="sales-tax-num">{amountText(line.vatBaht)}</td>
    </tr>
  )
}
