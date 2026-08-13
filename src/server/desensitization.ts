export type SensitiveReplacementCounts = Record<'phone' | 'email' | 'identity', number>

export function desensitizeMeetingContent(content: string): { content: string; replacements: SensitiveReplacementCounts } {
  const replacements: SensitiveReplacementCounts = { phone: 0, email: 0, identity: 0 }
  let value = content.replace(/\b\d{17}[\dXx]\b/g, () => {
    replacements.identity += 1
    return '[IDENTITY]'
  })
  value = value.replace(/\b1[3-9]\d{9}\b/g, () => {
    replacements.phone += 1
    return '[PHONE]'
  })
  value = value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, () => {
    replacements.email += 1
    return '[EMAIL]'
  })
  return { content: value, replacements }
}
