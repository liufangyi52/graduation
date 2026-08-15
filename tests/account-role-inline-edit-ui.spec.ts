import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

it('uses a clickable role tag and conditional select for account role editing', () => {
  const app = source('../src/App.vue')
  const styles = source('../src/style.css')

  expect(app).toContain('editingManagedUserId')
  expect(app).toContain('role-tag-button')
  expect(app).toContain('updateManagedUserRole')
  expect(app).toContain('v-if="editingManagedUserId !== managed.id"')
  expect(app).toContain('value="manager"')
  expect(app).toContain('value="member"')
  expect(app).toContain('value="admin"')
  expect(app).toContain('value="auditor"')
  expect(styles).toContain('.role-tag-button')
})
