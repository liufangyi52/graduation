import { expect, it } from 'vitest'
import { eventsForDate } from '../src/utils/calendar'
import type { CalendarEvent } from '../src/services/workspaceService'

it('returns only events matching the selected local ISO date', () => {
  const events = [
    { id: 'task-1', type: 'task', title: 'Release checklist', project: 'Alpha', date: '2026-08-15' },
    { id: 'meeting-1', type: 'meeting', title: 'Release review', project: 'Alpha', date: '2026-08-12' },
  ] as CalendarEvent[]

  expect(eventsForDate(events, '2026-08-12')).toEqual([events[1]])
})
