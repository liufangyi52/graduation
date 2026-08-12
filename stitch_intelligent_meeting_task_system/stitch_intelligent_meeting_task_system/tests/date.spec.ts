import { expect, it } from 'vitest'
import { formatLocalDate } from '../src/utils/date'

it('formats a local date with the Chinese weekday', () => {
  expect(formatLocalDate(new Date(2026, 7, 10))).toBe('2026 年 8 月 10 日 · 星期一')
})
