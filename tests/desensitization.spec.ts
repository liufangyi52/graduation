import { expect, it } from 'vitest'
import { desensitizeMeetingContent } from '../src/server/desensitization'

it('replaces email, Chinese mobile, and identity number without changing normal text', () => {
  const result = desensitizeMeetingContent('联系 a@example.com，电话 13800138000，证件 11010519491231002X。')

  expect(result.content).toBe('联系 [EMAIL]，电话 [PHONE]，证件 [IDENTITY]。')
  expect(result.replacements).toEqual({ email: 1, phone: 1, identity: 1 })
})
