import { useEffect, useState, type JSX } from 'react'
import { Box, Center, Loader, Text } from '@mantine/core'
import { emptyRecord, type StationRecord } from '../../shared/types'
import { RecordPreview } from './RecordPreview'
import './print.css'

export function PrintView(): JSX.Element {
  const [record, setRecord] = useState<StationRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    window.api
      .loadForm()
      .then((data) => {
        if (cancelled) return
        setRecord(data ?? emptyRecord())
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ')
        setRecord(emptyRecord())
      })
      .finally(() => {
        window.setTimeout(() => window.api.notifyPrintReady(), 50)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!record) {
    return (
      <Center h="100vh">
        <Loader color="teal" />
      </Center>
    )
  }

  return (
    <Box p="xl" bg="white" mih="100vh">
      {error ? (
        <Text c="red" mb="md">
          {error}
        </Text>
      ) : null}
      <RecordPreview record={record} />
    </Box>
  )
}
