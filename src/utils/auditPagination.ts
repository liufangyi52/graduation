export interface AuditPagination<T> {
  items: T[]
  page: number
  pageCount: number
  total: number
}

function positiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback

  return Math.max(1, Math.floor(value))
}

export function paginateAuditLogs<T>(
  items: readonly T[],
  requestedPage = 1,
  pageSize = 15,
): AuditPagination<T> {
  const normalizedPageSize = positiveInteger(pageSize, 15)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / normalizedPageSize))
  const page = Math.min(Math.max(1, positiveInteger(requestedPage, 1)), pageCount)
  const start = (page - 1) * normalizedPageSize

  return {
    items: items.slice(start, start + normalizedPageSize),
    page,
    pageCount,
    total,
  }
}

export function visibleAuditPages(page: number, pageCount: number): number[] {
  const normalizedPageCount = positiveInteger(pageCount, 1)
  const normalizedPage = Math.min(Math.max(1, positiveInteger(page, 1)), normalizedPageCount)
  const windowSize = Math.min(5, normalizedPageCount)
  const start = Math.min(
    Math.max(1, normalizedPage - Math.floor(windowSize / 2)),
    normalizedPageCount - windowSize + 1,
  )

  return Array.from({ length: windowSize }, (_, index) => start + index)
}
