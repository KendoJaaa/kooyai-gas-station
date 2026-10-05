import { Badge, Button, Group, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useEffect, useState, type JSX } from 'react'
import { version } from '../../../package.json'
import type { AppUpdateStatus } from '../../shared/types'

export function AppVersion(): JSX.Element {
  const [status, setStatus] = useState<AppUpdateStatus>({ current: version, ready: false })
  const [loading, setLoading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    if (!window.api?.checkForUpdate) return
    const load = (): void => {
      void window.api.checkForUpdate().then(setStatus)
    }
    load()
    const timer = window.setInterval(load, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const update = async (): Promise<void> => {
    if (!window.api?.downloadUpdate) return
    setLoading(true)
    try {
      const result = await window.api.downloadUpdate()
      const next = await window.api.getUpdateStatus()
      setStatus(next)
      if (!result.ok) {
        notifications.show({ color: 'red', title: 'อัปเดตไม่ได้', message: result.message })
        return
      }
      setDownloaded(true)
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'อัปเดตไม่ได้',
        message: error instanceof Error ? error.message : 'ดาวน์โหลดไม่สำเร็จ'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <Badge size="lg" variant="filled" radius="sm" style={{ flexShrink: 0 }}>
        {status.current}
      </Badge>
      {status.available ? (
        downloaded || status.ready ? (
          <Text size="sm" c="orange" fw={700} style={{ whiteSpace: 'nowrap' }}>
            ดาวน์โหลดรุ่น {status.available} แล้ว — ปิดโปรแกรม แล้วเปิดใหม่
          </Text>
        ) : (
          <Button color="orange" size="compact-md" loading={loading} onClick={() => void update()}>
            รุ่นใหม่ {status.available} — กดอัปเดต
          </Button>
        )
      ) : null}
    </Group>
  )
}
