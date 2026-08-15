import { expect, it } from 'vitest'
import { canRegisterRole, canUpdateTask, normalizeTaskState } from '../src/server/authorization'

it('allows public registration only for members', () => {
  expect(canRegisterRole('member')).toBe(true)
  expect(canRegisterRole('manager')).toBe(false)
  expect(canRegisterRole('admin')).toBe(false)
  expect(canRegisterRole('auditor')).toBe(false)
})

it('keeps auditors read-only while allowing members to update their own task', () => {
  expect(canUpdateTask({ role: 'auditor', id: 'auditor-1' }, 'member-1')).toBe(false)
  expect(canUpdateTask({ role: 'member', id: 'member-1' }, 'member-1')).toBe(true)
  expect(canUpdateTask({ role: 'member', id: 'member-1' }, 'member-2')).toBe(false)
  expect(canUpdateTask({ role: 'manager', id: 'manager-1' }, 'member-2')).toBe(true)
})

it('normalizes task status and progress as one invariant pair', () => {
  expect(normalizeTaskState({ status: 'todo', progress: 20 }, { status: 'completed' })).toEqual({ status: 'completed', progress: 100 })
  expect(normalizeTaskState({ status: 'completed', progress: 100 }, { status: 'in_progress' })).toEqual({ status: 'in_progress', progress: 99 })
  expect(normalizeTaskState({ status: 'completed', progress: 100 }, { status: 'todo' })).toEqual({ status: 'todo', progress: 0 })
  expect(normalizeTaskState({ status: 'todo', progress: 0 }, { progress: 100 })).toEqual({ status: 'completed', progress: 100 })
  expect(normalizeTaskState({ status: 'in_progress', progress: 70 }, { status: 'closed' })).toEqual({ status: 'closed', progress: 70 })
})
