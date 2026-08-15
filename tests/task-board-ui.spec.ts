import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/TaskBoardPage.vue', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

it('supports query-synchronized task filters in the default table view', () => {
  for (const token of ['project', 'assignee', 'status', 'priority', 'risk', 'dueFrom', 'dueTo']) expect(source).toContain(token)
  expect(source).toContain("router.replace({ query })")
  expect(source).toContain('in-progress')
  expect(source).toContain('closed')
  expect(source).toContain('任务列表')
  expect(source).not.toContain('看板')
})

it('does not expose internal task identifiers on member task cards', () => {
  expect(appSource).toContain('class="member-task-card"')
  expect(appSource).not.toContain('<span class="mono">{{ task.id }}</span>')
})

it('summarizes the signed-in member task progress on the my-tasks page', () => {
  expect(appSource).toContain('const myTaskCompletionRate = computed(() => averageTaskProgress(myTasks.value))')
  expect(appSource).toContain('我的实时完成进度')
})

it('keeps completed tasks immutable from the task-board advance action', () => {
  expect(source).toContain("task.state !== 'completed' && task.state !== 'closed'")
  expect(source).toContain(':disabled="Boolean(updatingTaskId)"')
  expect(source).not.toContain('await load()')
})

it('sends a reminder rather than changing an unfinished task from the board', () => {
  expect(source).toContain('await service.remindTask(task.id)')
  expect(source).not.toContain('await service.updateTaskState(task.id, next)')
  expect(source).toContain("props.user.role === 'manager'")
})

it('filters open risks by the persisted task relationship', () => {
  expect(source).toContain("risk.taskId === task.id")
  expect(source).not.toContain('`${risk.title}${risk.task}`.includes(task.id)')
})

it('keeps task filters inside a responsive board-specific grid', () => {
  expect(source).toContain('class="risk-filter"')
  expect(source).toContain('class="date-filter"')
  expect(styles).toContain('.board-filters { display: grid;')
  expect(styles).toMatch(/\.board-filters \.risk-filter \{[^}]*white-space: nowrap;/)
  expect(styles).toContain('@media (max-width: 640px) { .board-filters')
})
