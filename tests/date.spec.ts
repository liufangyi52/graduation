import { expect, it } from 'vitest'
import { beijingGreeting, formatBeijingDate, formatBeijingDateTime, formatBeijingMinute, formatLocalDate } from '../src/utils/date'

it('formats a local date with the Chinese weekday', () => {
  expect(formatLocalDate(new Date(2026, 7, 10))).toBe('2026 年 8 月 10 日 · 星期一')
})

it('uses Beijing time when selecting a dashboard greeting', () => {
  expect(beijingGreeting(new Date('2026-08-12T01:00:00.000Z'))).toBe('上午好')
  expect(beijingGreeting(new Date('2026-08-12T05:00:00.000Z'))).toBe('下午好')
  expect(beijingGreeting(new Date('2026-08-12T11:00:00.000Z'))).toBe('晚上好')
})

it('formats the dashboard date in the Beijing timezone', () => {
  expect(formatBeijingDate(new Date('2026-08-11T17:00:00.000Z'))).toBe('2026 年 8 月 12 日 · 星期三')
})

it('formats a task publication timestamp in Beijing time without ISO suffixes', () => {
  expect(formatBeijingDateTime('2026-08-14T09:05:00.000Z')).toBe('2026年8月14日 17:05')
})

it('formats task deadlines in Beijing time to the minute', () => {
  expect(formatBeijingMinute('2026-08-15T08:00:00.000Z')).toBe('2026-08-15 16:00')
})
