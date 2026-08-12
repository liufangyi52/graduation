import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from '../src/server/database'
import { resetExistingUserPasswords } from '../src/server/reset-existing-user-passwords'

const testPassword = '12345678'

async function main() {
  const updatedCount = await resetExistingUserPasswords({
    async listUserIds() {
      const [rows] = await pool.query<Array<{ id: string }>>('SELECT id FROM users')
      return rows.map((row) => row.id)
    },
    hashPassword: (password) => bcrypt.hash(password, 12),
    async updateUserPassword(id, passwordHash) {
      await pool.execute(
        'UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?',
        [passwordHash, id],
      )
    },
  }, testPassword)

  console.log(`Updated ${updatedCount} existing user accounts.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(async () => {
  await pool.end()
})
