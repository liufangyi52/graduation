import { expect, it } from 'vitest'
import { createRagIndexRequestGuard } from '../src/services/ragIndexRequestGuard'

it('rejects a delayed A1 status response after an A-to-B-to-A selection cycle', () => {
  const guard = createRagIndexRequestGuard()
  let status = { configured: true, ready: true }
  let loading = true

  guard.select('A')
  const a1 = guard.issue('status', 'A')
  guard.select('B')
  guard.select('A')
  const a2 = guard.issue('status', 'A')

  if (guard.isCurrent(a1)) status = { configured: false, ready: false }
  if (guard.isCurrent(a1)) loading = false

  expect(status).toEqual({ configured: true, ready: true })
  expect(loading).toBe(true)
  expect(guard.isCurrent(a2)).toBe(true)
})

it('rejects a delayed A1 sync result after an A-to-B-to-A selection cycle', () => {
  const guard = createRagIndexRequestGuard()
  let notice = ''
  let syncing = true

  guard.select('A')
  const a1 = guard.issue('sync', 'A')
  guard.select('B')
  guard.select('A')
  const a2 = guard.issue('sync', 'A')

  if (guard.isCurrent(a1)) notice = 'A1 complete'
  if (guard.isCurrent(a1)) syncing = false

  expect(notice).toBe('')
  expect(syncing).toBe(true)
  expect(guard.isCurrent(a2)).toBe(true)
})

it('supersedes an earlier request in the same channel without blocking other channels', () => {
  const guard = createRagIndexRequestGuard()
  guard.select('A')
  const status = guard.issue('status', 'A')
  const summary1 = guard.issue('summary', 'A')
  const summary2 = guard.issue('summary', 'A')

  expect(guard.isCurrent(status)).toBe(true)
  expect(guard.isCurrent(summary1)).toBe(false)
  expect(guard.isCurrent(summary2)).toBe(true)
})
