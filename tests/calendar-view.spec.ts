import { expect, it } from 'vitest'
import { calendarMonthDays, eventsForCalendarDate, eventsForDate, visibleCalendarEvents } from '../src/utils/calendar'
import type { CalendarEvent } from '../src/services/workspaceService'

it('returns only events matching the selected local ISO date', () => {
  const events = [
    { id: 'task-1', type: 'task', title: 'Release checklist', project: 'Alpha', date: '2026-08-15' },
    { id: 'meeting-1', type: 'meeting', title: 'Release review', project: 'Alpha', date: '2026-08-12' },
  ] as CalendarEvent[]

  expect(eventsForDate(events, '2026-08-12')).toEqual([events[1]])
})

it('builds a Monday-first six-week month grid and limits a day to three visible events', () => {
  const days = calendarMonthDays('2026-08-01')
  const events = Array.from({ length: 5 }, (_, index) => ({ id: `task-${index}`, type: 'task', title: `Task ${index}`, project: 'Alpha', date: '2026-08-12' })) as CalendarEvent[]

  expect(days).toHaveLength(42)
  expect(days[0]).toMatchObject({ date: '2026-07-27', inMonth: false })
  expect(days[5]).toMatchObject({ date: '2026-08-01', inMonth: true })
  expect(days[41]).toMatchObject({ date: '2026-09-06', inMonth: false })
  expect(visibleCalendarEvents(eventsForCalendarDate(events, '2026-08-12'))).toHaveLength(3)
  expect(eventsForCalendarDate(events, '2026-08-12').slice(3)).toHaveLength(2)
})
