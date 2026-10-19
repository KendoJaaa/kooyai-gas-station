import { useEffect, useState, type JSX } from 'react'
import { Button, Group, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  prepareIdentity,
  prepareStationConfig,
  validateIdentity,
  validateStationConfig,
  type StationConfig,
  type StationIdentity
} from '../../shared/station'
import { IdentityFields } from './IdentityFields'
import { StationConfigEditor } from './StationConfigEditor'
import { useStationStore } from './StationStore'
import './kor-form/kor-form.css'

export function SettingsPage({ onOpenSetup }: { onOpenSetup: () => void }): JSX.Element {
  const { store, setStore } = useStationStore()
  const [saving, setSaving] = useState(false)
  const [identity, setIdentity] = useState<StationIdentity>(store.identity)
  const [config, setConfig] = useState<StationConfig>(store.config)
  const [syncSaving, setSyncSaving] = useState(false)
  const [sharedDatabase, setSharedDatabase] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>()
  const [lastSyncError, setLastSyncError] = useState<string | undefined>()

  useEffect(() => {
    if (!window.api?.getSyncSettings) return
    void window.api.getSyncSettings().then((settings) => {
      setSharedDatabase(settings.configured)
      setLastSyncAt(settings.lastSyncAt)
      setLastSyncError(settings.lastSyncError)
    })
  }, [])

  const persist = async (): Promise<void> => {
    const identityProblem = validateIdentity(identity)
    if (identityProblem) {
      notifications.show({ color: 'red', title: 'บันทึกไม่ได้', message: identityProblem })
      return
    }
    const prepared = prepareStationConfig(config)
    const problem = validateStationConfig(prepared)
    if (problem) {
      notifications.show({ color: 'red', title: 'บันทึกไม่ได้', message: problem })
      return
    }

    const next = {
      ...store,
      identity: prepareIdentity(identity),
      config: prepared,
      setupCompleted: true
    }
    setSaving(true)
    try {
      if (!window.api) {
        setStore(next)
        setConfig(prepared)
        setIdentity(next.identity)
        notifications.show({
          color: 'yellow',
          title: 'โหมดดูตัวอย่าง',
          message: 'บันทึกในเครื่องได้เมื่อเปิดจากโปรแกรม'
        })
        return
      }
      const response = await window.api.saveStore(next)
      if (!response.ok) {
        notifications.show({ color: 'red', title: 'บันทึกไม่สำเร็จ', message: response.message })
        return
      }
      setStore(next)
      setConfig(prepared)
      setIdentity(next.identity)
      notifications.show({
        color: 'teal',
        title: 'บันทึกแล้ว',
        message: 'หัวจ่ายและประเภทน้ำมันใช้กับหน้าบันทึกรายวันแล้ว ยอดเก่าไม่ถูกลบ'
      })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'บันทึกไม่สำเร็จ',
        message: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
      })
    } finally {
      setSaving(false)
    }
  }

  const syncNow = async (): Promise<void> => {
    if (!window.api?.syncNow) return
    setSyncSaving(true)
    try {
      const result = await window.api.syncNow()
      if (!result.ok) {
        notifications.show({ color: 'red', title: 'ซิงค์ไม่สำเร็จ', message: result.message })
        return
      }
      const loaded = await window.api.loadStore()
      setStore(loaded)
      setIdentity(loaded.identity)
      setConfig(loaded.config)
      const settings = await window.api.getSyncSettings()
      setSharedDatabase(settings.configured)
      setLastSyncAt(settings.lastSyncAt)
      setLastSyncError(undefined)
      notifications.show({ color: 'teal', title: 'ซิงค์แล้ว', message: 'ดึงจาก Atlas แล้วบันทึกกลับขึ้นไป' })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'ซิงค์ไม่สำเร็จ',
        message: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
      })
    } finally {
      setSyncSaving(false)
    }
  }

  return (
    <Stack gap="lg">
      <Text c="dimmed">
        กำหนดข้อมูลสถานี ประเภทน้ำมัน หัวจ่าย และถัง ยอดที่บันทึกไว้แล้วไม่หาย
      </Text>

      <Group justify="space-between">
        <Button variant="light" onClick={onOpenSetup}>
          เปิดตัวช่วยตั้งค่าเริ่มต้น
        </Button>
        <Button loading={saving} onClick={() => void persist()}>
          บันทึกการตั้งค่า
        </Button>
      </Group>

      <section>
        <Title order={4} mb="sm">
          ฐานข้อมูลบริษัท
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          ทุกเครื่องที่ติดตั้งโปรแกรมนี้ใช้ฐานข้อมูลเดียวกัน วันบันทึกทั้งหมดอยู่บนฐานข้อมูลบริษัท
          เครื่องนี้เก็บย้อนหลัง 3 เดือนไว้ใช้ตอนเน็ตขาด แล้วซิงค์เมื่อเน็ตกลับ
        </Text>
        {sharedDatabase ? (
          <Text size="sm" mb="xs">
            เชื่อมกับฐานข้อมูลบริษัทแล้ว
          </Text>
        ) : (
          <Text size="sm" c="red" mb="xs">
            รุ่นนี้ยังไม่ได้ใส่ฐานข้อมูลบริษัท
          </Text>
        )}
        {lastSyncAt ? (
          <Text size="sm" c="dimmed" mb="xs">
            ซิงค์ล่าสุด {lastSyncAt}
          </Text>
        ) : null}
        {lastSyncError ? (
          <Text size="sm" c="red" mb="xs">
            {lastSyncError}
          </Text>
        ) : null}
        <Button loading={syncSaving} disabled={!sharedDatabase} onClick={() => void syncNow()}>
          ซิงค์ตอนนี้
        </Button>
      </section>

      <section>
        <Title order={4} mb="sm">
          ข้อมูลสถานี
        </Title>
        <IdentityFields
          identity={identity}
          onChange={(patch) => setIdentity((current) => ({ ...current, ...patch }))}
        />
      </section>

      <StationConfigEditor config={config} onChange={setConfig} />
    </Stack>
  )
}
