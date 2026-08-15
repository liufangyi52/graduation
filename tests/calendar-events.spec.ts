import { expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

it('returns task deadlines and meeting dates scoped to a manager-owned project', async () => {
  const query = vi.spyOn(pool, 'query').mockResolvedValueOnce([[
    { id: 'task-1', type: 'task', title: 'Release checklist', project_id: 'project-1', project_name: 'Alpha', date: '2026-08-15', assignee_name: 'Member', priority: 'high', status: 'todo' },
    { id: 'meeting-1', type: 'meeting', title: 'Release review', project_id: 'project-1', project_name: 'Alpha', date: '2026-08-12' },
  ]] as any)
  const service = new AppService({} as any)

  await expect(service.calendarEvents({ id: 'manager-1', role: 'manager', name: 'Manager', email: 'manager@example.com' })).resolves.toHaveLength(2)
  expect(query).toHaveBeenCalledWith(expect.stringContaining('p.owner_id=?'), ['manager-1', 'manager-1'])
})

it('returns only the signed-in member task deadlines while retaining project meetings', async () => {
  const query = vi.spyOn(pool, 'query').mockResolvedValueOnce([[]] as any)

  await new AppService({} as any).calendarEvents({ id: 'member-1', role: 'member', name: 'Member', email: 'member@example.com' })

  expect(query).toHaveBeenCalledWith(expect.stringContaining('t.assignee_id=pm.user_id'), ['member-1', 'member-1'])
})
