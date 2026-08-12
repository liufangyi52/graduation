import type { CalendarEvent } from '../services/workspaceService'

export function localIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function shiftIsoDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + days)
  return localIsoDate(value)
}

export function formatCalendarDate(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`))
}

export function eventsForDate(events: CalendarEvent[], date: string): CalendarEvent[] {
  return events.filter((event) => event.date === date)
}
