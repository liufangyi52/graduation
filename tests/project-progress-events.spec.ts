import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('creates an indexed append-only project progress event table', () => {
  const migration = readFileSync(new URL('../src/server/migrate.ts', import.meta.url), 'utf8')

  expect(migration).toContain('CREATE TABLE IF NOT EXISTS project_progress_events')
  expect(migration).toContain('idx_progress_events_project_created')
  expect(migration).toContain('feedback_content TEXT NULL')
})

it('injects the WebSocket gateway into the progress event publisher', () => {
  const source = readFileSync(new URL('../src/server/project-progress-events.service.ts', import.meta.url), 'utf8')

  expect(source).toContain("import { Inject, Injectable } from '@nestjs/common'")
  expect(source).toContain('@Inject(ProjectProgressGateway) private readonly gateway: ProjectProgressGateway')
})
