import { useEffect, useMemo, useState, type JSX } from 'react'
import { AppShell, Button, Group, Modal, Stack, Text, Title } from '@mantine/core'
import { DatePickerInput, MonthPickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import {
  compactDay,
  defaultPrices,
  emptyDay,
  meterHistory,
  type DayRecord
} from '../../shared/reports'
import { unusedNozzleMeters, type DayReadings } from '../../shared/station'
import { dayFor, withDay, type AppStore } from '../../shared/store'
import { retentionStart } from '../../shared/retention'
import { DailyCloseSheet } from './DailyCloseSheet'
import { DayExtras } from './DayExtras'
import { useStationStore } from './StationStore'
import { AppVersion } from './AppVersion'
import { isoToday, isoYesterday, savedAtLabel } from './kor-form/dates'
import { formatMeter, parseMeter } from './kor-form/numbers'
import {
  formatIssueSummary,
  hugeSales,
  issuesToErrorMap,
  validateDailyForm
} from './kor-form/validateDaily'

function showSavedPdf(title: string, filePath: string): void {
  notifications.show({
    color: 'teal',
    title,
    autoClose: 8000,
    message: (
      <button
        type="button"
        onClick={() => {
          void window.api?.openPath(filePath).then((result) => {
            if (result && !result.ok) {
              notifications.show({ color: 'red', title: 'เปิดไฟล์ไม่ได้', message: result.message })
            }
          })
        }}
        style={{
          display: 'block',
          width: '100%',
          margin: 0,
          padding: 0,
          border: 0,
          background: 'none',
          color: 'inherit',
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          wordBreak: 'break-all',
          textDecoration: 'underline'
        }}
      >
        {filePath}
      </button>
    )
  })
}

function toIsoDate(value: Date | string | null): string {
  if (!value) return isoYesterday()
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : isoYesterday()
}

function readingsFromDrafts(drafts: Record<string, string>): DayReadings {
  const readings: DayReadings = {}
  for (const [id, text] of Object.entries(drafts)) {
    const parsed = parseMeter(text)
    if (parsed != null) readings[id] = parsed
  }
  return readings
}

function draftsFromReadings(readings: DayReadings | undefined): Record<string, string> {
  if (!readings) return {}
  return Object.fromEntries(
    Object.entries(readings).map(([id, value]) => [id, String(value)])
  )
}

function draftsFromPrices(prices: Record<string, number> | undefined): Record<string, string> {
  if (!prices) return {}
  return Object.fromEntries(
    Object.entries(prices)
      .filter(([, value]) => value > 0)
      .map(([id, value]) => [id, String(value)])
  )
}

function broughtDraftsFor(
  store: AppStore,
  date: string,
  rec: DayRecord
): Record<string, string> {
  const existing = draftsFromReadings(rec.varianceStarts)
  if (Object.keys(existing).length > 0) return existing
  const hasPriorSameMonth = Object.keys(store.days).some(
    (key) => key < date && key.slice(0, 7) === date.slice(0, 7)
  )
  if (hasPriorSameMonth) return {}
  const hasEarlierMonth = Object.keys(store.days).some((key) => key.slice(0, 7) < date.slice(0, 7))
  if (hasEarlierMonth) return {}
  return Object.fromEntries(
    store.config.tanks
      .filter(
        (tank) => typeof tank.openingVariance === 'number' && tank.openingVariance !== 0
      )
      .map((tank) => [tank.id, String(tank.openingVariance)])
  )
}

function applyDrafts(
  day: DayRecord,
  meterDrafts: Record<string, string>,
  stickDrafts: Record<string, string>,
  startDrafts: Record<string, string>,
  priceDrafts: Record<string, string>,
  broughtDrafts: Record<string, string>
): DayRecord {
  return {
    ...day,
    meters: readingsFromDrafts(meterDrafts),
    tankSticks: readingsFromDrafts(stickDrafts),
    tankStarts: readingsFromDrafts(startDrafts),
    varianceStarts: readingsFromDrafts(broughtDrafts),
    prices: readingsFromDrafts(priceDrafts)
  }
}

function clearFieldError(errors: Record<string, string>, key: string): Record<string, string> {
  if (!(key in errors)) return errors
  const next = { ...errors }
  delete next[key]
  return next
}

export function DailyPage({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element {
  const { store, setStore } = useStationStore()
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState(isoYesterday())
  const [day, setDay] = useState<DayRecord>(emptyDay())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [stickDrafts, setStickDrafts] = useState<Record<string, string>>({})
  const [startDrafts, setStartDrafts] = useState<Record<string, string>>({})
  const [broughtDrafts, setBroughtDrafts] = useState<Record<string, string>>({})
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pendingExport, setPendingExport] = useState(false)
  const [hugeOpen, setHugeOpen] = useState(false)
  const [hugeLines, setHugeLines] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [pendingDate, setPendingDate] = useState<string | null>(null)
  const [taxOpen, setTaxOpen] = useState(false)
  const [taxMonth, setTaxMonth] = useState<Date | null>(dayjs(isoYesterday()).startOf('month').toDate())
  const [exportingTax, setExportingTax] = useState(false)

  const loadDate = (nextStore: AppStore, nextDate: string): void => {
    const rec = dayFor(nextStore, nextDate)
    const prices = defaultPrices(nextStore.config, nextDate, nextStore.days, rec)
    setDate(nextDate)
    setDay({ ...rec, prices })
    setDrafts(draftsFromReadings(rec.meters))
    setStickDrafts(draftsFromReadings(rec.tankSticks))
    setStartDrafts(draftsFromReadings(rec.tankStarts))
    setBroughtDrafts(broughtDraftsFor(nextStore, nextDate, rec))
    setPriceDrafts(draftsFromPrices(prices))
    setFieldErrors({})
    setDirty(false)
    setLeaveOpen(false)
    setPendingDate(null)
  }

  const requestDate = (nextDate: string): void => {
    if (nextDate === date) return
    if (!dirty) {
      loadDate(store, nextDate)
      return
    }
    setPendingDate(nextDate)
    setLeaveOpen(true)
  }

  useEffect(() => {
    loadDate(store, isoYesterday())
  }, [])

  const liveDay = useMemo(
    () => applyDrafts(day, drafts, stickDrafts, startDrafts, priceDrafts, broughtDrafts),
    [day, drafts, stickDrafts, startDrafts, priceDrafts, broughtDrafts]
  )

  const persist = async (): Promise<boolean> => {
    const meters = {
      ...liveDay.meters,
      ...unusedNozzleMeters(store.config, date, meterHistory(store.days))
    }
    const next = withDay(
      store,
      date,
      compactDay({ ...liveDay, meters, savedAt: new Date().toISOString() })
    )

    try {
      if (!window.api) {
        setStore(next)
        setDay(next.days[date] ?? emptyDay())
        setDirty(false)
        notifications.show({
          color: 'yellow',
          title: 'โหมดดูตัวอย่าง',
          message: 'บันทึกในเครื่องได้เมื่อเปิดจากโปรแกรม'
        })
        return false
      }
      const response = await window.api.saveStore(next)
      if (!response.ok) {
        notifications.show({ color: 'red', title: 'บันทึกไม่สำเร็จ', message: response.message })
        return false
      }
      setStore(next)
      setDay(next.days[date] ?? emptyDay())
      setDirty(false)
      if (response.synced === false && response.syncMessage) {
        notifications.show({
          color: 'yellow',
          title: 'บันทึกในเครื่องแล้ว',
          message: `ยังซิงค์ MongoDB ไม่ได้: ${response.syncMessage}`
        })
      }
      return true
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'บันทึกไม่สำเร็จ',
        message: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
      })
      return false
    }
  }

  const validateOrNotify = (): boolean => {
    const issues = validateDailyForm(store.config, date, store.days, liveDay, {
      meters: drafts,
      prices: priceDrafts,
      sticks: stickDrafts,
      starts: startDrafts,
      broughts: broughtDrafts
    })
    if (issues.length === 0) {
      setFieldErrors({})
      return true
    }
    setFieldErrors(issuesToErrorMap(issues))
    notifications.show({
      color: 'red',
      title: 'กรอกไม่ครบ',
      message: formatIssueSummary(issues),
      autoClose: 8000,
      styles: { description: { whiteSpace: 'pre-line' } }
    })
    requestAnimationFrame(() => {
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    })
    return false
  }

  const runSave = async (exportPdf: boolean): Promise<void> => {
    setSaving(true)
    try {
      const saved = await persist()
      if (!saved) return
      if (!exportPdf) {
        const leftover = validateDailyForm(store.config, date, store.days, liveDay, {
          meters: drafts,
          prices: priceDrafts,
          sticks: stickDrafts,
          starts: startDrafts,
          broughts: broughtDrafts
        })
        notifications.show({
          color: leftover.length > 0 ? 'yellow' : 'teal',
          title: 'บันทึกแล้ว',
          message:
            leftover.length > 0
              ? 'เก็บไว้ในเครื่องนี้ ยังกรอกไม่ครบ — ส่งออก PDF ได้เมื่อกรอกครบ'
              : 'เก็บไว้ในเครื่องนี้'
        })
        return
      }
      const result = await window.api.exportPdf()
      if ('canceled' in result && result.canceled) {
        notifications.show({
          color: 'teal',
          title: 'บันทึกแล้ว',
          message: 'เก็บไว้ในเครื่องนี้ ยังไม่ได้สร้าง PDF'
        })
        return
      }
      if (!result.ok) {
        notifications.show({
          color: 'red',
          title: 'บันทึกแล้ว แต่ส่งออก PDF ไม่สำเร็จ',
          message: 'message' in result ? result.message : 'เกิดข้อผิดพลาด'
        })
        return
      }
      showSavedPdf('บันทึกแล้ว และสร้าง PDF', result.filePath)
    } finally {
      setSaving(false)
    }
  }

  const onSave = (exportPdf: boolean): void => {
    if (exportPdf) {
      if (!validateOrNotify()) return
      const huge = hugeSales(store.config, date, store.days, liveDay, drafts)
      if (huge.length > 0) {
        setHugeLines(
          huge.map((item) => `หัวจ่าย ${item.nozzleNo} ขาย ${formatMeter(item.liters)} ลิตร`)
        )
        setPendingExport(true)
        setHugeOpen(true)
        return
      }
    } else {
      setFieldErrors({})
    }
    void runSave(exportPdf)
  }

  const openTaxReport = (): void => {
    setTaxMonth(dayjs(date).startOf('month').toDate())
    setTaxOpen(true)
  }

  const savedDaysInTaxMonth = useMemo(() => {
    if (!taxMonth) return 0
    const month = dayjs(taxMonth).format('YYYY-MM')
    return Object.keys(store.days).filter((key) => key.startsWith(`${month}-`)).length
  }, [store.days, taxMonth])

  const exportTaxReport = async (): Promise<void> => {
    if (!taxMonth) return
    const month = dayjs(taxMonth).format('YYYY-MM')
    if (!window.api?.exportTaxPdf) {
      notifications.show({
        color: 'yellow',
        title: 'โหมดดูตัวอย่าง',
        message: 'ส่งออก PDF ได้เมื่อเปิดจากโปรแกรม'
      })
      return
    }
    setExportingTax(true)
    try {
      const result = await window.api.exportTaxPdf(month)
      if (!result.ok) {
        if ('canceled' in result && result.canceled) return
        notifications.show({
          color: 'red',
          title: 'ส่งออกไม่สำเร็จ',
          message: 'message' in result ? result.message : 'ส่งออก PDF ไม่สำเร็จ'
        })
        return
      }
      showSavedPdf('สร้าง PDF แล้ว', result.filePath)
      setTaxOpen(false)
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'ส่งออกไม่สำเร็จ',
        message: error instanceof Error ? error.message : 'ส่งออก PDF ไม่สำเร็จ'
      })
    } finally {
      setExportingTax(false)
    }
  }

  return (
    <AppShell padding="lg" header={{ height: 56 }}>
      <AppShell.Header px="lg">
        <Group h="100%" justify="space-between" wrap="nowrap" gap="md" align="center">
          <Group wrap="nowrap" gap="md" align="center">
            <Text fw={700} style={{ whiteSpace: 'nowrap' }}>
              บันทึกปั้ม
            </Text>
            <AppVersion />
            <Group wrap="nowrap" gap="xs" align="center">
              <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
                วันที่ (เมื่อวาน)
              </Text>
              <DatePickerInput
                size="sm"
                w={200}
                valueFormat="D MMMM BBBB"
                locale="th"
                aria-label="วันที่"
                minDate={dayjs(retentionStart(isoToday())).toDate()}
                value={dayjs(date).toDate()}
                onChange={(value) => {
                  const nextDate = toIsoDate(value as Date | string | null)
                  requestDate(nextDate)
                }}
              />
            </Group>
          </Group>
          <Group wrap="nowrap" gap="sm" align="center">
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {savedAtLabel(day.savedAt)}
            </Text>
            <Button variant="default" loading={saving} onClick={() => onSave(false)}>
              บันทึกอย่างเดียว
            </Button>
            <Button loading={saving} onClick={() => onSave(true)}>
              บันทึก และส่งออก PDF
            </Button>
            <Button variant="default" size="sm" onClick={openTaxReport}>
              รายงานภาษีขาย
            </Button>
            <Button variant="subtle" onClick={onOpenSettings}>
              ตั้งค่า
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Stack gap="md">
          <div>
            <Title order={2}>ปิดยอดเมื่อวาน</Title>
            <Text c="dimmed">
              กรอกครั้งเดียวตอนเช้า เลขมิเตอร์และไม้วัดเช้านี้คือปลายงวดของเมื่อวาน
              และจะไปเป็นต้นงวดของวันนี้ ผลต่างคำนวณจากวัดปลายงวดลบบัญชี
              บันทึกอย่างเดียวได้แม้ยังกรอกไม่ครบ ส่งออก PDF ต้องกรอกมิเตอร์ ราคา ต้นงวด และวัดปลายงวดให้ครบ
            </Text>
          </div>
          <DailyCloseSheet
            config={store.config}
            date={date}
            days={store.days}
            day={liveDay}
            meterDrafts={drafts}
            priceDrafts={priceDrafts}
            stickDrafts={stickDrafts}
            startDrafts={startDrafts}
            broughtDrafts={broughtDrafts}
            fieldErrors={fieldErrors}
            onMeterChange={(machineId, text) => {
              setDirty(true)
              setDrafts((current) => ({ ...current, [machineId]: text }))
              setFieldErrors((current) => clearFieldError(current, `meter:${machineId}`))
            }}
            onPriceChange={(fuelTypeId, text) => {
              setDirty(true)
              setPriceDrafts((current) => ({ ...current, [fuelTypeId]: text }))
              setFieldErrors((current) => clearFieldError(current, `price:${fuelTypeId}`))
            }}
            onStickChange={(tankId, text) => {
              setDirty(true)
              setStickDrafts((current) => ({ ...current, [tankId]: text }))
              setFieldErrors((current) => clearFieldError(current, `stick:${tankId}`))
            }}
            onStartChange={(tankId, text) => {
              setDirty(true)
              setStartDrafts((current) => ({ ...current, [tankId]: text }))
              setFieldErrors((current) => clearFieldError(current, `start:${tankId}`))
            }}
            onBroughtChange={(tankId, text) => {
              setDirty(true)
              setBroughtDrafts((current) => ({ ...current, [tankId]: text }))
              setFieldErrors((current) => clearFieldError(current, `brought:${tankId}`))
            }}
            extras={
              <DayExtras
                key={date}
                config={store.config}
                date={date}
                day={liveDay}
                onDayChange={(next) => {
                  setDirty(true)
                  setDay(next)
                }}
              />
            }
          />

          <Modal
            opened={leaveOpen}
            onClose={() => {
              setLeaveOpen(false)
              setPendingDate(null)
            }}
            title="ยังไม่ได้บันทึก"
            centered
          >
            <Stack gap="md">
              <Text>ถ้าเปลี่ยนวันที่ ตัวเลขที่กรอกหน้านี้จะหาย</Text>
              <Group justify="flex-end">
                <Button
                  variant="default"
                  onClick={() => {
                    setLeaveOpen(false)
                    setPendingDate(null)
                  }}
                >
                  อยู่หน้านี้
                </Button>
                <Button
                  color="red"
                  onClick={() => {
                    if (pendingDate) loadDate(store, pendingDate)
                  }}
                >
                  เปลี่ยนวันที่
                </Button>
              </Group>
            </Stack>
          </Modal>

          <Modal
            opened={hugeOpen}
            onClose={() => setHugeOpen(false)}
            title="ตัวเลขนี้ถูกไหม"
            centered
          >
            <Stack gap="md">
              <Text>ยอดขายสูงผิดปกติ อาจพิมพ์มิเตอร์ผิด</Text>
              {hugeLines.map((line) => (
                <Text key={line}>{line}</Text>
              ))}
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setHugeOpen(false)}>
                  กลับไปแก้
                </Button>
                <Button
                  onClick={() => {
                    setHugeOpen(false)
                    void runSave(pendingExport)
                  }}
                >
                  ใช่ บันทึก
                </Button>
              </Group>
            </Stack>
          </Modal>

          <Modal opened={taxOpen} onClose={() => setTaxOpen(false)} title="รายงานภาษีขาย" centered>
            <Stack gap="md">
              <Text size="sm">
                รวมทุกวันในเดือนที่เลือก จากยอดปิดรายวันที่บันทึกไว้ มูลค่าสินค้าและภาษีขายใช้ตัวเลขชุดเดียวกับส่วน ก
              </Text>
              <MonthPickerInput
                label="เดือนภาษี"
                locale="th"
                valueFormat="MMMM BBBB"
                value={taxMonth}
                maxDate={dayjs(isoToday()).toDate()}
                minDate={dayjs(retentionStart(isoToday())).toDate()}
                onChange={(value) => {
                  if (!value) {
                    setTaxMonth(null)
                    return
                  }
                  const parsed = dayjs(value as Date | string)
                  setTaxMonth(parsed.isValid() ? parsed.startOf('month').toDate() : null)
                }}
              />
              <Text size="sm" c="dimmed">
                {savedDaysInTaxMonth > 0
                  ? `บันทึกไว้แล้ว ${savedDaysInTaxMonth} วัน วันที่ยังไม่ปิดยอดจะเป็นช่องว่าง`
                  : 'เดือนนี้ยังไม่มีวันปิดยอด รายงานจะเป็นช่องว่างทุกวัน'}
              </Text>
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setTaxOpen(false)}>
                  ยกเลิก
                </Button>
                <Button loading={exportingTax} onClick={() => void exportTaxReport()}>
                  ส่งออก PDF
                </Button>
              </Group>
            </Stack>
          </Modal>
        </Stack>
      </AppShell.Main>
    </AppShell>
  )
}
