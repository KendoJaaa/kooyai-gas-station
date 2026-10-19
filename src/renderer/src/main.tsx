import './sentry'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/notifications/styles.css'
import 'dayjs/locale/th'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { Notifications } from '@mantine/notifications'
import App from './App'

const theme = createTheme({
  fontFamily: 'Leelawadee UI, Tahoma, Segoe UI, sans-serif',
  primaryColor: 'teal',
  defaultRadius: 'md',
  headings: {
    fontFamily: 'Leelawadee UI, Tahoma, Segoe UI, sans-serif'
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <DatesProvider settings={{ locale: 'th', firstDayOfWeek: 0, weekendDays: [0, 6] }}>
        <Notifications position="top-right" />
        <App />
      </DatesProvider>
    </MantineProvider>
  </StrictMode>
)
