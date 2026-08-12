import { expect, it } from 'vitest'
import { assertTaskUpdateInput, canManageProject, canUpdateTask } from '../src/server/authorization'

it('enforces task and project ownership boundaries', () => {
  expect(canUpdateTask({ role: 'member', id: 'm1' }, 'm2')).toBe(false)
  expect(canUpdateTask({ role: 'member', id: 'm1' }, 'm1')).toBe(true)
  expect(canUpdateTask({ role: 'manager', id: 'manager-1' }, 'm2')).toBe(true)
  expect(canUpdateTask({ role: 'admin', id: 'admin-1' }, 'm2')).toBe(false)
  expect(canManageProject({ role: 'manager', id: 'manager-1' }, 'manager-2')).toBe(false)
  expect(canManageProject({ role: 'manager', id: 'manager-1' }, 'manager-1')).toBe(true)
  expect(canManageProject({ role: 'admin', id: 'admin-1' }, 'manager-2')).toBe(false)
})

it('rejects invalid task status and progress instead of coercing values', () => {
  expect(() => assertTaskUpdateInput({ status: 'unknown' })).toThrow('Invalid task status')
  expect(() => assertTaskUpdateInput({ progress: 101 })).toThrow('Invalid task progress')
  expect(() => assertTaskUpdateInput({ progress: 12.5 })).toThrow('Invalid task progress')
  expect(() => assertTaskUpdateInput({ status: 'in_progress', progress: 50 })).not.toThrow()
})
