const weekdays = ['日', '一', '二', '三', '四', '五', '六']

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · 星期${weekdays[date.getDay()]}`
}
