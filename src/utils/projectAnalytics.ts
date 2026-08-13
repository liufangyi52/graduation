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
}

export interface UndatedTask {
  id: string
  title: string
  status: ProjectTaskStatus
}

export interface ProjectAnalytics {
  metrics: ProjectAnalyticsMetrics
  completionTrend: CompletionTrendPoint[]
  riskDistribution: RiskDistributionPoint[]
  ganttTasks: GanttTask[]
  undatedTasks: UndatedTask[]
}

const riskLevels: RiskLevel[] = ['low', 'medium', 'high']

function calendarDate(value: string): string {
  return value.slice(0, 10)
}

export function buildProjectAnalytics(input: ProjectAnalyticsInput, today: string): ProjectAnalytics {
  const normalizedToday = calendarDate(today)
  const completedTasks = input.tasks.filter((task) => task.status === 'completed')
  const overdueTasks = input.tasks.filter((task) => task.dueDate && calendarDate(task.dueDate) < normalizedToday && task.status !== 'completed' && task.status !== 'closed')
  const openRisks = input.risks.filter((risk) => risk.status === 'open')
  const completionDates = new Map<string, number>()

  for (const task of completedTasks) {
    if (!task.completedAt) continue
    const date = calendarDate(task.completedAt)
    completionDates.set(date, (completionDates.get(date) ?? 0) + 1)
  }

  const ganttTasks: GanttTask[] = []
  const undatedTasks: UndatedTask[] = []
  for (const task of input.tasks) {
    if (task.dueDate) {
      ganttTasks.push({ id: task.id, title: task.title, start: task.createdAt, end: task.dueDate, status: task.status })
    } else {
      undatedTasks.push({ id: task.id, title: task.title, status: task.status })
    }
  }

  const totalTasks = input.tasks.length
  return {
    metrics: {
      totalTasks,
      completedTasks: completedTasks.length,
      overdueTasks: overdueTasks.length,
      openRisks: openRisks.length,
      completionRate: totalTasks === 0 ? 0 : Math.round((completedTasks.length / totalTasks) * 100),
    },
    completionTrend: [...completionDates.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([date, count]) => ({ date, count })),
    riskDistribution: riskLevels.map((level) => ({ level, count: openRisks.filter((risk) => risk.level === level).length })).filter((item) => item.count > 0),
    ganttTasks,
    undatedTasks,
  }
}
