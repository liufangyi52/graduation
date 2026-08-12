import { expect, it } from 'vitest'
import { canRegisterRole, canUpdateTask } from '../src/server/authorization'

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
