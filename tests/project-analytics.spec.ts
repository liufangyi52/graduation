import { expect, it } from 'vitest'
import { averageDeliveryCycleDays, buildMemberDeliveryEfficiency, buildProjectAnalytics } from '../src/utils/projectAnalytics'

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
    { id: 'completed', title: 'Completed', start: '2026-08-01', end: '2026-08-11', status: 'completed', displayStatus: 'completed', progress: 100, deadlineAlert: null, deadlineDaysLeft: null, left: 0, width: 92 },
    { id: 'overdue', title: 'Overdue', start: '2026-08-02', end: '2026-08-12', status: 'in_progress', displayStatus: 'in_progress', progress: 0, deadlineAlert: 'overdue', deadlineDaysLeft: -1, left: 8, width: 92 },
    { id: 'closed', title: 'Closed', start: '2026-08-03', end: '2026-08-12', status: 'closed', displayStatus: 'completed', progress: 100, deadlineAlert: null, deadlineDaysLeft: null, left: 17, width: 83 },
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
    ganttRange: null,
    ganttTasks: [],
    undatedTasks: [],
    burndown: { planned: [], actual: [] },
  })
})

it('does not mark a task due today as overdue when today is an ISO timestamp', () => {
  const analytics = buildProjectAnalytics({
    tasks: [{ id: 'today', title: 'Due today', status: 'in_progress', createdAt: '2026-08-01', dueDate: '2026-08-13' }],
    risks: [],
  }, '2026-08-13T00:00:00Z')
  expect(analytics.metrics.overdueTasks).toBe(0)
})

it('carries a member-reported task progress value into the gantt task', () => {
  const analytics = buildProjectAnalytics({
    tasks: [{ id: 'member-progress', title: 'Member progress', status: 'in_progress', progress: 45, createdAt: '2026-08-01', dueDate: '2026-08-05' }],
    risks: [],
  }, '2026-08-02')

  expect(analytics.ganttTasks[0]).toMatchObject({ id: 'member-progress', progress: 45 })
})

it('normalizes gantt states and exposes three-day deadline alerts', () => {
  const analytics = buildProjectAnalytics({
    tasks: [
      { id: 'todo', title: 'Todo', status: 'todo', createdAt: '2026-08-01', dueDate: '2026-08-16' },
      { id: 'active', title: 'Active', status: 'in_progress', progress: 25, createdAt: '2026-08-01', dueDate: '2026-08-13' },
      { id: 'done', title: 'Done', status: 'closed', createdAt: '2026-08-01', dueDate: '2026-08-13' },
    ],
    risks: [],
  }, '2026-08-14')

  expect(analytics.ganttTasks.map((task) => ({
    id: task.id,
    displayStatus: task.displayStatus,
    deadlineAlert: task.deadlineAlert,
    deadlineDaysLeft: task.deadlineDaysLeft,
  }))).toEqual([
    { id: 'todo', displayStatus: 'todo', deadlineAlert: 'due_soon', deadlineDaysLeft: 2 },
    { id: 'active', displayStatus: 'in_progress', deadlineAlert: 'overdue', deadlineDaysLeft: -1 },
    { id: 'done', displayStatus: 'completed', deadlineAlert: null, deadlineDaysLeft: null },
  ])
})

it('derives date-proportional gantt geometry and remaining-work burndown points', () => {
  const analytics = buildProjectAnalytics({
    tasks: [
      { id: 'first', title: 'First', status: 'completed', createdAt: '2026-08-01', completedAt: '2026-08-02', dueDate: '2026-08-04' },
      { id: 'second', title: 'Second', status: 'in_progress', createdAt: '2026-08-02', dueDate: '2026-08-03' },
    ],
    risks: [],
  }, '2026-08-02')

  expect(analytics.ganttRange).toEqual({ start: '2026-08-01', end: '2026-08-04', days: 4 })
  expect(analytics.ganttTasks).toEqual([
    { id: 'first', title: 'First', start: '2026-08-01', end: '2026-08-04', status: 'completed', displayStatus: 'completed', progress: 100, deadlineAlert: null, deadlineDaysLeft: null, left: 0, width: 100 },
    { id: 'second', title: 'Second', start: '2026-08-02', end: '2026-08-03', status: 'in_progress', displayStatus: 'in_progress', progress: 0, deadlineAlert: 'due_soon', deadlineDaysLeft: 1, left: 25, width: 50 },
  ])
  expect(analytics.burndown).toEqual({
    planned: [
      { date: '2026-08-01', remaining: 2 },
      { date: '2026-08-02', remaining: 1 },
      { date: '2026-08-03', remaining: 1 },
      { date: '2026-08-04', remaining: 0 },
    ],
    actual: [
      { date: '2026-08-01', remaining: 2 },
      { date: '2026-08-02', remaining: 1 },
    ],
  })
})

it('excludes invalid dates and does not fabricate actual burndown history', () => {
  const analytics = buildProjectAnalytics({
    tasks: [
      { id: 'dated', title: 'Dated', status: 'todo', createdAt: '2026-08-01', dueDate: '2026-08-02' },
      { id: 'invalid', title: 'Invalid', status: 'completed', createdAt: 'invalid', completedAt: 'invalid', dueDate: 'invalid' },
      { id: 'unknown-completion', title: 'Unknown', status: 'completed', createdAt: '2026-08-01' },
    ],
    risks: [],
  }, '2026-08-02')

  expect(analytics.ganttTasks).toHaveLength(1)
  expect(analytics.undatedTasks).toEqual(expect.arrayContaining([{ id: 'invalid', title: 'Invalid', status: 'completed' }]))
  expect(analytics.burndown.actual).toEqual([])
})

it('groups and ranks member delivery efficiency from attributable tasks', () => {
  const members = buildMemberDeliveryEfficiency([
    { owner: '李明', status: 'completed', progress: 30, createdAt: '2026-08-01', completedAt: '2026-08-02' },
    { owner: '李明', status: 'in_progress', progress: 140, createdAt: '2026-08-01' },
    { owner: '王芳', status: 'completed', progress: 100, createdAt: '2026-08-01', completedAt: '2026-08-03' },
    { owner: '王芳', status: 'todo', progress: -20, createdAt: '2026-08-01' },
    { owner: '  ', status: 'completed', progress: 100, createdAt: '2026-08-01', completedAt: '2026-08-02' },
  ])

  expect(members).toEqual([
    { owner: '李明', totalTasks: 2, completedTasks: 1, averageProgress: 100, completionRate: 50 },
    { owner: '王芳', totalTasks: 2, completedTasks: 1, averageProgress: 50, completionRate: 50 },
  ])
})

it('averages only valid completed delivery intervals', () => {
  const average = averageDeliveryCycleDays([
    { owner: '李明', status: 'completed', createdAt: '2026-08-01T00:00:00Z', completedAt: '2026-08-02T00:00:00Z' },
    { owner: '王芳', status: 'completed', createdAt: '2026-08-01T00:00:00Z', completedAt: '2026-08-03T00:00:00Z' },
    { owner: '张伟', status: 'in_progress', createdAt: '2026-08-01T00:00:00Z', completedAt: '2026-08-10T00:00:00Z' },
    { owner: '陈晨', status: 'completed', createdAt: 'invalid', completedAt: '2026-08-02T00:00:00Z' },
    { owner: '赵敏', status: 'completed', createdAt: '2026-08-03T00:00:00Z', completedAt: '2026-08-02T00:00:00Z' },
  ])

  expect(average).toBe(1.5)
  expect(averageDeliveryCycleDays([
    { owner: '李明', status: 'todo', createdAt: '2026-08-01T00:00:00Z' },
    { owner: '王芳', status: 'completed', createdAt: 'invalid', completedAt: 'invalid' },
  ])).toBeNull()
})
