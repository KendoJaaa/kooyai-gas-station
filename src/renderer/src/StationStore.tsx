import { createContext, useContext, useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import { Center, Loader } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { emptyStore, isAppStore, migrateStore, type AppStore } from '../../shared/store'
import { isoToday } from './kor-form/dates'

interface StationStoreValue {
  store: AppStore
  setStore: (store: AppStore) => void
}

const StationStoreContext = createContext<StationStoreValue | null>(null)

export function StationStoreProvider({ children }: { children: ReactNode }): JSX.Element {
  const [store, setStore] = useState<AppStore | null>(null)

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
      .catch((error: unknown) => {
        if (cancelled) return
        notifications.show({
          color: 'red',
          title: 'โหลดข้อมูลไม่สำเร็จ',
          message: error instanceof Error ? error.message : 'อ่านไฟล์ในเครื่องไม่ได้'
        })
        setStore(emptyStore(isoToday()))
      })

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => (store ? { store, setStore: (next: AppStore) => setStore(next) } : null),
    [store]
  )

  if (!value) {
    return (
      <Center h="100vh">
        <Loader color="teal" />
      </Center>
    )
  }

  return <StationStoreContext.Provider value={value}>{children}</StationStoreContext.Provider>
}

export function useStationStore(): StationStoreValue {
  const value = useContext(StationStoreContext)
  if (!value) {
    throw new Error('useStationStore must be used inside StationStoreProvider')
  }
  return value
}
