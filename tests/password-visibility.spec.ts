import { expect, it } from 'vitest'
import { passwordInputType } from '../src/views/loginForm'

it('uses text input when password visibility is enabled', () => {
  expect(passwordInputType(true)).toBe('text')
  expect(passwordInputType(false)).toBe('password')
})
