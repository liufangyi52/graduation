import { expect, it } from 'vitest'
import { paginateAuditLogs, visibleAuditPages } from '../src/utils/auditPagination'

const records = [
  { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }, { id: 8 },
  { id: 9 }, { id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }, { id: 15 }, { id: 16 },
  { id: 17 }, { id: 18 }, { id: 19 }, { id: 20 }, { id: 21 }, { id: 22 }, { id: 23 }, { id: 24 },
  { id: 25 }, { id: 26 }, { id: 27 }, { id: 28 }, { id: 29 }, { id: 30 }, { id: 31 }, { id: 32 },
]

it('returns the first 15 literal records and pagination metadata', () => {
  expect(paginateAuditLogs(records, 1, 15)).toEqual({
    items: records.slice(0, 15),
    page: 1,
    pageCount: 3,
    total: 32,
  })
})

it('clamps an out-of-range requested page to the last available page', () => {
  expect(paginateAuditLogs(records, 99, 15)).toEqual({
    items: [{ id: 31 }, { id: 32 }],
    page: 3,
    pageCount: 3,
    total: 32,
  })
})

it('returns a compact five-page window and all pages when fewer exist', () => {
  expect(visibleAuditPages(5, 9)).toEqual([3, 4, 5, 6, 7])
  expect(visibleAuditPages(1, 3)).toEqual([1, 2, 3])
})

it('supports a page size of 30', () => {
  const result = paginateAuditLogs(records, 1, 30)

  expect(result.items).toHaveLength(30)
  expect(result.pageCount).toBe(2)
})

it('returns the first page of an empty list', () => {
  expect(paginateAuditLogs([], 99, 15)).toEqual({
    items: [],
    page: 1,
    pageCount: 1,
    total: 0,
  })
})

it('normalizes non-positive fractional page requests and sizes', () => {
  expect(paginateAuditLogs(records, -2.6, 0)).toEqual({
    items: [{ id: 1 }],
    page: 1,
    pageCount: 32,
    total: 32,
  })
})
