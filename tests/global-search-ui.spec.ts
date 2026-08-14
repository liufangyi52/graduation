import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const routerSource = readFileSync(new URL('../src/router.ts', import.meta.url), 'utf8')

it('submits the global search field to a dedicated results route', () => {
  expect(appSource).toContain('@keyup.enter="submitGlobalSearch"')
  expect(appSource).toContain("currentPage === 'search'")
  expect(appSource).toContain('globalSearchResults')
  expect(routerSource).toContain("path: '/search'")
})
