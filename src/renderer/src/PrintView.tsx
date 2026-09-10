import { useEffect, useState, type JSX } from 'react'
import { Center, Loader, Text } from '@mantine/core'
import { emptyDay, hasInvoicePage, type DayRecord } from '../../shared/reports'
import { emptyStore, isAppStore, migrateStore, type AppStore } from '../../shared/store'
import { isoToday, periodLabel, printedAtNow } from './kor-form/dates'
import { KhorFormPage } from './kor-form/KhorFormPage'
import { KorFormPage } from './kor-form/KorFormPage'
import { KorInvoicePage } from './kor-form/KorInvoicePage'
import { korHeaderFrom } from './kor-form/sampleHeader'
import './print.css'

export function PrintView(): JSX.Element {
  const [store, setStore] = useState<AppStore | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        window.setTimeout(() => window.api.notifyPrintReady(), 50)
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

  const date = store.activeDate || isoToday()
  const day: DayRecord = store.days[date] ?? emptyDay()
  const showInvoices = hasInvoicePage(day)
  const pageCount = showInvoices ? 3 : 2
  const header = korHeaderFrom(store.identity, periodLabel(date), printedAtNow())

  return (
    <div className="kor-print-set">
      {error ? (
        <Text c="red" mb="sm">
          {error}
        </Text>
      ) : null}
      <KorFormPage
        config={store.config}
        date={date}
        days={store.days}
        day={day}
        header={header}
        page={1}
        pageCount={pageCount}
      />
      {showInvoices ? (
        <KorInvoicePage
          config={store.config}
          date={date}
          days={store.days}
          day={day}
          header={header}
          page={2}
          pageCount={pageCount}
        />
      ) : null}
      <KhorFormPage
        config={store.config}
        date={date}
        days={store.days}
        day={day}
        header={header}
        page={pageCount}
        pageCount={pageCount}
      />
    </div>
  )
}
