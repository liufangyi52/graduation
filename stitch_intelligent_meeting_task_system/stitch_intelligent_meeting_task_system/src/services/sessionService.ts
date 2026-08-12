import type { AuthSession, UserAccount } from './authService'

export async function refreshSession(
  session: AuthSession,
  loadUser: (token: string) => Promise<UserAccount>,
): Promise<AuthSession> {
  try {
    return { ...session, user: await loadUser(session.token) }
  } catch {
    return session
  }
}
