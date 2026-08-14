const weekdays = ['日', '一', '二', '三', '四', '五', '六']

function beijingParts(date: Date): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · 星期${weekdays[date.getDay()]}`
}

export function formatBeijingDate(date: Date): string {
  const parts = beijingParts(date)
  return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日 · ${parts.weekday}`
}

export function formatBeijingDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '发布时间未知'
  const parts = beijingParts(date)
  return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`
}

export function formatBeijingMinute(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const parts = beijingParts(date)
  return `${parts.year}-${parts.month.padStart(2, '0')}-${parts.day.padStart(2, '0')} ${parts.hour}:${parts.minute}`
}

export function beijingGreeting(date: Date): string {
  const hour = Number(beijingParts(date).hour)
  if (hour < 12) return '上午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}
