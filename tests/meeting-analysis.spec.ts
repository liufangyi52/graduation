import { expect, it } from 'vitest'
import { normalizeStoredAnalysis } from '../src/server/app.service'
import { normalizeAnalysis } from '../src/server/deepseek.service'

it('normalizes a DeepSeek meeting analysis into task and risk candidates', () => {
  const result = normalizeAnalysis({
    summary: '确定下周发布',
    decisions: ['下周发布版本'],
    tasks: [{ title: '准备发布清单', owner_email: 'member@example.com', due_date: '2026-08-15', priority: 'high' }],
    risks: [{ title: '发布时间紧张', level: 'medium', description: '测试窗口较短' }],
  })

  expect(result.summary).toBe('确定下周发布')
  expect(result.tasks[0].title).toBe('准备发布清单')
  expect(result.risks[0].level).toBe('medium')
})

it('rejects an analysis without a task title', () => {
  expect(() => normalizeAnalysis({ summary: 'x', tasks: [{}], risks: [] })).toThrow('task title')
})

it('accepts a MySQL JSON object stored for an analysis', () => {
  const result = normalizeStoredAnalysis({
    summary: 'Release is scheduled',
    decisions: ['Deploy next week'],
    tasks: [{ title: 'Prepare checklist', priority: 'high' }],
    risks: [],
  })

  expect(result).toMatchObject({
    summary: 'Release is scheduled',
    tasks: [{ title: 'Prepare checklist', priority: 'high' }],
  })
})
