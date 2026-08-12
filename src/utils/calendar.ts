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

export function formatCalendarMonth(month: string): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(`${month.slice(0, 7)}-01T12:00:00`))
}

export function shiftCalendarMonth(month: string, months: number): string {
  const value = new Date(`${month.slice(0, 7)}-01T12:00:00`)
  value.setMonth(value.getMonth() + months)
  return localIsoDate(value).slice(0, 10)
}

export function eventsForDate(events: CalendarEvent[], date: string): CalendarEvent[] {
  return events.filter((event) => event.date === date)
}

export function calendarMonthDays(month: string): { date: string; inMonth: boolean }[] {
  const firstDay = new Date(`${month.slice(0, 7)}-01T12:00:00`)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(firstDay)
  gridStart.setDate(gridStart.getDate() - mondayOffset)
  const monthKey = month.slice(0, 7)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const isoDate = localIsoDate(date)
    return { date: isoDate, inMonth: isoDate.startsWith(monthKey) }
  })
}

export function eventsForCalendarDate(events: CalendarEvent[], date: string): CalendarEvent[] {
  return eventsForDate(events, date)
}

export function visibleCalendarEvents(events: CalendarEvent[], limit = 3): CalendarEvent[] {
  return events.slice(0, limit)
}
