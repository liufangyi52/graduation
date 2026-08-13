import { expect, it } from 'vitest'
import { buildProjectAnalytics } from '../src/utils/projectAnalytics'

it('builds project metrics, completion trend, risks, and gantt task groups', () => {
  const analytics = buildProjectAnalytics({
    tasks: [
      { id: 'completed', title: 'Completed', status: 'completed', createdAt: '2026-08-01', completedAt: '2026-08-10', dueDate: '2026-08-11' },
      { id: 'overdue', title: 'Overdue', status: 'in_progress', createdAt: '2026-08-02', dueDate: '2026-08-12' },
      { id: 'closed', title: 'Closed', status: 'closed', createdAt: '2026-08-03', dueDate: '2026-08-12' },
      { id: 'undated', title: 'Undated', status: 'todo', createdAt: '2026-08-04' },
      { id: 'missing-completion-date', title: 'Missing completion date', status: 'completed', createdAt: '2026-08-05' },
    ],
    risks: [
      { id: 'low', level: 'low', status: 'open' },
      { id: 'medium', level: 'medium', status: 'open' },
      { id: 'high', level: 'high', status: 'open' },
      { id: 'resolved', level: 'high', status: 'resolved' },
    ],
  }, '2026-08-13')

  expect(analytics.metrics).toEqual({ totalTasks: 5, completedTasks: 2, overdueTasks: 1, openRisks: 3, completionRate: 40 })
  expect(analytics.completionTrend).toEqual([{ date: '2026-08-10', count: 1 }])
  expect(analytics.riskDistribution).toEqual([
    { level: 'low', count: 1 },
    { level: 'medium', count: 1 },
    { level: 'high', count: 1 },
  ])
  expect(analytics.ganttTasks).toEqual([
    { id: 'completed', title: 'Completed', start: '2026-08-01', end: '2026-08-11', status: 'completed' },
    { id: 'overdue', title: 'Overdue', start: '2026-08-02', end: '2026-08-12', status: 'in_progress' },
    { id: 'closed', title: 'Closed', start: '2026-08-03', end: '2026-08-12', status: 'closed' },
  ])
  expect(analytics.undatedTasks).toEqual([
    { id: 'undated', title: 'Undated', status: 'todo' },
    { id: 'missing-completion-date', title: 'Missing completion date', status: 'completed' },
  ])
})

it('returns zero completion rate and empty groups for a project without tasks or risks', () => {
  expect(buildProjectAnalytics({ tasks: [], risks: [] }, '2026-08-13')).toEqual({
    metrics: { totalTasks: 0, completedTasks: 0, overdueTasks: 0, openRisks: 0, completionRate: 0 },
    completionTrend: [],
    riskDistribution: [],
    ganttTasks: [],
    undatedTasks: [],
  })
})
