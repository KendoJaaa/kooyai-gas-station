import { useState, type JSX } from 'react'
import { AppShell, Button, Group } from '@mantine/core'
import { needsSetup } from '../../shared/store'
import { DailyPage } from './DailyPage'
import { PrintView } from './PrintView'
import { SalesTaxPrint } from './SalesTaxPrint'
import { SettingsPage } from './SettingsPage'
import { SetupPage } from './SetupPage'
import { StationStoreProvider, useStationStore } from './StationStore'

type AppPage = 'daily' | 'settings' | 'setup'

export default function App(): JSX.Element {
  const printKind = new URLSearchParams(window.location.search).get('print')

  if (printKind === '1') {
    return <PrintView />
  }

  if (printKind === 'tax') {
    return <SalesTaxPrint />
  }

  return (
    <StationStoreProvider>
      <AppContent />
    </StationStoreProvider>
  )
}

function AppContent(): JSX.Element {
  const { store } = useStationStore()
  const firstRun = needsSetup(store)
  const [page, setPage] = useState<AppPage>(firstRun ? 'setup' : 'daily')

  if (page === 'setup') {
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
          <span>แบบบันทึกสถานีน้ำมัน</span>
        </AppShell.Header>
        <AppShell.Main>
          <SetupPage
            allowCancel={!firstRun}
            onDone={() => setPage('daily')}
            onCancel={() => setPage('settings')}
          />
        </AppShell.Main>
      </AppShell>
    )
  }

  if (page === 'settings') {
    return (
      <AppShell padding="lg" header={{ height: 56 }}>
        <AppShell.Header px="lg">
          <Group h="100%" gap="md">
            <Button variant="default" onClick={() => setPage('daily')}>
              กลับ
            </Button>
            <span style={{ fontWeight: 700 }}>ตั้งค่าสถานี</span>
          </Group>
        </AppShell.Header>
        <AppShell.Main>
          <SettingsPage onOpenSetup={() => setPage('setup')} />
        </AppShell.Main>
      </AppShell>
    )
  }

  return <DailyPage onOpenSettings={() => setPage('settings')} />
}
