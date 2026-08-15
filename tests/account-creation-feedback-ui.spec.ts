import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

it('keeps account creation feedback inside the modal', () => {
  for (const name of ['createUserErrors', 'createUserSubmitError', 'creatingUser', 'validateNewUser', 'aria-busy']) expect(app).toContain(name)
  expect(app).toContain('请输入有效的邮箱地址')
  expect(app).toContain('创建中...')
  expect(app).toContain(':disabled="creatingUser"')
})
