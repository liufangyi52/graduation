export type ProjectTaskStatus = 'todo' | 'in_progress' | 'completed' | 'closed' | string
export type RiskLevel = 'low' | 'medium' | 'high'

export interface ProjectAnalyticsTask {
  id: string
  title: string
  status: ProjectTaskStatus
  createdAt: string
  dueDate?: string | null
  completedAt?: string | null
}

export interface ProjectAnalyticsRisk {
  id: string
  level: RiskLevel
  status: string
}

export interface ProjectAnalyticsInput {
  tasks: ProjectAnalyticsTask[]
  risks: ProjectAnalyticsRisk[]
}

export interface ProjectAnalyticsMetrics {
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  openRisks: number
  completionRate: number
}

export interface CompletionTrendPoint {
  date: string
  count: number
}

export interface RiskDistributionPoint {
  level: RiskLevel
  count: number
}

export interface GanttTask {
  id: string
  title: string
  start: string
  end: string
  status: ProjectTaskStatus
  left: number
  width: number
}

export interface GanttRange { start: string; end: string; days: number }
export interface BurndownPoint { date: string; remaining: number }
export interface Burndown { planned: BurndownPoint[]; actual: BurndownPoint[] }

export interface UndatedTask {
  id: string
  title: string
  status: ProjectTaskStatus
}

export interface ProjectAnalytics {
  metrics: ProjectAnalyticsMetrics
  completionTrend: CompletionTrendPoint[]
  riskDistribution: RiskDistributionPoint[]
  ganttRange: GanttRange | null
  ganttTasks: GanttTask[]
  undatedTasks: UndatedTask[]
  burndown: Burndown
}

const riskLevels: RiskLevel[] = ['low', 'medium', 'high']

function calendarDate(value: string): string | null {
  const date = String(value ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? date : null
}

function dayNumber(date: string): number { return Date.parse(`${date}T00:00:00Z`) / 86_400_000 }

function calendarDates(start: string, end: string): string[] {
  const days: string[] = []
  for (let day = dayNumber(start); day <= dayNumber(end); day += 1) days.push(new Date(day * 86_400_000).toISOString().slice(0, 10))
  return days
}

export function buildProjectAnalytics(input: ProjectAnalyticsInput, today: string): ProjectAnalytics {
  const normalizedToday = calendarDate(today) ?? today.slice(0, 10)
  const completedTasks = input.tasks.filter((task) => task.status === 'completed')
  const overdueTasks = input.tasks.filter((task) => {
    const dueDate = task.dueDate ? calendarDate(task.dueDate) : null
    return dueDate && dueDate < normalizedToday && task.status !== 'completed' && task.status !== 'closed'
  })
  const openRisks = input.risks.filter((risk) => risk.status === 'open')
  const completionDates = new Map<string, number>()

  for (const task of completedTasks) {
    const date = task.completedAt ? calendarDate(task.completedAt) : null
    if (!date) continue
    completionDates.set(date, (completionDates.get(date) ?? 0) + 1)
  }

  const ganttTasks: GanttTask[] = []
  const undatedTasks: UndatedTask[] = []
  const datedTasks = input.tasks.flatMap((task) => {
    const start = calendarDate(task.createdAt)
    const end = task.dueDate ? calendarDate(task.dueDate) : null
    return start && end && end >= start ? [{ task, start, end }] : []
  })
  for (const task of input.tasks) {
    if (!datedTasks.some((item) => item.task.id === task.id)) {
      undatedTasks.push({ id: task.id, title: task.title, status: task.status })
    }
  }

  const ganttRange = datedTasks.length ? {
    start: datedTasks.map((item) => item.start).sort()[0],
    end: datedTasks.map((item) => item.end).sort().at(-1)!,
  } : null
  const rangeDays = ganttRange ? dayNumber(ganttRange.end) - dayNumber(ganttRange.start) + 1 : 0
  if (ganttRange) {
    for (const { task, start, end } of datedTasks) {
      ganttTasks.push({
        id: task.id, title: task.title, start, end, status: task.status,
        left: Math.round(((dayNumber(start) - dayNumber(ganttRange.start)) / rangeDays) * 100),
        width: Math.min(100, Math.max(1, Math.round(((dayNumber(end) - dayNumber(start) + 1) / rangeDays) * 100))),
      })
    }
  }

  const totalTasks = input.tasks.length
  const planned = ganttRange ? calendarDates(ganttRange.start, ganttRange.end).map((date, index) => ({ date, remaining: Math.max(0, totalTasks - Math.round((index / Math.max(1, rangeDays - 1)) * totalTasks)) })) : []
  const completedByDate = [...completionDates.entries()].sort(([first], [second]) => first.localeCompare(second))
  const actual = ganttRange && completedByDate.length
    ? [{ date: ganttRange.start, remaining: totalTasks }, ...completedByDate.filter(([date]) => date >= ganttRange.start).map(([date, count], index) => ({ date, remaining: totalTasks - completedByDate.slice(0, index + 1).reduce((sum, [, value]) => sum + value, 0) }))]
    : []
  return {
    metrics: {
      totalTasks,
      completedTasks: completedTasks.length,
      overdueTasks: overdueTasks.length,
      openRisks: openRisks.length,
      completionRate: totalTasks === 0 ? 0 : Math.round((completedTasks.length / totalTasks) * 100),
    },
    completionTrend: completedByDate.map(([date, count]) => ({ date, count })),
    riskDistribution: riskLevels.map((level) => ({ level, count: openRisks.filter((risk) => risk.level === level).length })).filter((item) => item.count > 0),
    ganttRange: ganttRange ? { ...ganttRange, days: rangeDays } : null,
    ganttTasks,
    undatedTasks,
    burndown: { planned, actual },
  }
}
