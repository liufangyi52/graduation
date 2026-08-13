import { expect, it } from 'vitest'
import { applyDesensitization, desensitizeMeetingContent } from '../src/server/desensitization'

it('replaces email, Chinese mobile, and identity number without changing normal text', () => {
  const result = desensitizeMeetingContent('联系 a@example.com，电话 13800138000，证件 11010519491231002X。')

  expect(result.content).toBe('联系 [EMAIL]，电话 [PHONE]，证件 [IDENTITY]。')
  expect(result.replacements).toEqual({ email: 1, phone: 1, identity: 1 })
})

it('runs enabled custom rules after fixed rules without exposing source matches', () => {
  const result = applyDesensitization('13800138000 ABC-19', [{ id: 'rule-1', pattern: 'ABC-\\d+', replacement: '[CODE]', enabled: true }])
  expect(result.content).toBe('[PHONE] [CODE]')
  expect(result.entries).toEqual(expect.arrayContaining([
    { ruleKind: 'fixed', ruleId: 'phone', hitCount: 1 },
    { ruleKind: 'custom', ruleId: 'rule-1', hitCount: 1 },
  ]))
  expect(JSON.stringify(result.entries)).not.toContain('ABC-19')
})
