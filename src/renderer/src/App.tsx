import type { JSX } from 'react'
import { AppShell } from '@mantine/core'
import { FormPage } from './FormPage'
import { PrintView } from './PrintView'

export default function App(): JSX.Element {
  const isPrint = new URLSearchParams(window.location.search).get('print') === '1'

  if (isPrint) {
    return <PrintView />
  }

  return (
    <AppShell padding="lg" header={{ height: 56 }}>
      <AppShell.Header
        px="lg"
        style={{
          display: 'flex',
          alignItems: 'center',
          fontWeight: 700
        }}
      >
        แบบบันทึกสถานีน้ำมัน
      </AppShell.Header>
      <AppShell.Main>
        <FormPage />
      </AppShell.Main>
    </AppShell>
  )
}
