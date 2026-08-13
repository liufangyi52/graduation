import { expect, it } from 'vitest'
import { assertManagedTaskInput } from '../src/server/authorization'

it('rejects a manager task without an assignee', () => {
  expect(() => assertManagedTaskInput({ title: 'Prepare release', assigneeId: '', priority: 'high' })).toThrow('Task assignee is required')
})
