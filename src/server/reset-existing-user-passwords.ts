export interface ResetExistingUserPasswordDependencies {
  listUserIds(): Promise<string[]>
  hashPassword(password: string): Promise<string>
  updateUserPassword(id: string, passwordHash: string): Promise<void>
}

export async function resetExistingUserPasswords(
  dependencies: ResetExistingUserPasswordDependencies,
  password: string,
): Promise<number> {
  const userIds = await dependencies.listUserIds()
  if (!userIds.length) return 0

  const passwordHash = await dependencies.hashPassword(password)
  await Promise.all(userIds.map((id) => dependencies.updateUserPassword(id, passwordHash)))
  return userIds.length
}
