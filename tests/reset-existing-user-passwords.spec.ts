import { expect, it, vi } from 'vitest'
import { resetExistingUserPasswords } from '../src/server/reset-existing-user-passwords'

it('resets every existing user and returns the updated count', async () => {
  const updateUserPassword = vi.fn().mockResolvedValue(undefined)
  const hashPassword = vi.fn().mockResolvedValue('bcrypt-hash')

  await expect(resetExistingUserPasswords({
    listUserIds: vi.fn().mockResolvedValue(['u1', 'u2']),
    updateUserPassword,
    hashPassword,
  }, '12345678')).resolves.toBe(2)

  expect(hashPassword).toHaveBeenCalledWith('12345678')
  expect(updateUserPassword).toHaveBeenCalledWith('u1', 'bcrypt-hash')
  expect(updateUserPassword).toHaveBeenCalledWith('u2', 'bcrypt-hash')
})

it('does not hash or update when no existing user exists', async () => {
  const updateUserPassword = vi.fn()
  const hashPassword = vi.fn()

  await expect(resetExistingUserPasswords({
    listUserIds: vi.fn().mockResolvedValue([]),
    updateUserPassword,
    hashPassword,
  }, '12345678')).resolves.toBe(0)

  expect(hashPassword).not.toHaveBeenCalled()
  expect(updateUserPassword).not.toHaveBeenCalled()
})
