export type SensitiveReplacementCounts = Record<'phone' | 'email' | 'identity', number>

export type CustomDesensitizationRule = {
  id: string
  pattern: string
  replacement: string
  enabled: boolean
}

export type DesensitizationEntry = {
  ruleKind: 'fixed' | 'custom'
  ruleId: string
  hitCount: number
}

function replaceAll(value: string, pattern: RegExp, replacement: string) {
  let hitCount = 0
  return { content: value.replace(pattern, () => { hitCount += 1; return replacement }), hitCount }
}

export function applyDesensitization(content: string, rules: CustomDesensitizationRule[] = []) {
  const entries: DesensitizationEntry[] = []
  let value = content
  for (const rule of [
    { id: 'identity', pattern: /\b\d{17}[\dXx]\b/g, replacement: '[IDENTITY]' },
    { id: 'phone', pattern: /\b1[3-9]\d{9}\b/g, replacement: '[PHONE]' },
    { id: 'email', pattern: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, replacement: '[EMAIL]' },
  ]) {
    const result = replaceAll(value, rule.pattern, rule.replacement)
    value = result.content
    entries.push({ ruleKind: 'fixed', ruleId: rule.id, hitCount: result.hitCount })
  }
  for (const rule of rules) {
    if (!rule.enabled) continue
    const result = replaceAll(value, new RegExp(rule.pattern, 'g'), rule.replacement)
    value = result.content
    entries.push({ ruleKind: 'custom', ruleId: rule.id, hitCount: result.hitCount })
  }
  return { content: value, entries }
}

export function desensitizeMeetingContent(content: string): { content: string; replacements: SensitiveReplacementCounts } {
  const result = applyDesensitization(content)
  const byId = Object.fromEntries(result.entries.map((entry) => [entry.ruleId, entry.hitCount]))
  return { content: result.content, replacements: { phone: byId.phone ?? 0, email: byId.email ?? 0, identity: byId.identity ?? 0 } }
}
