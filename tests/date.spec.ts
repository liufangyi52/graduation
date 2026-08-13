import { expect, it } from 'vitest'
import { beijingGreeting, formatBeijingDate, formatLocalDate } from '../src/utils/date'

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
