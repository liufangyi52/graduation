<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import App from './App.vue'
import LoginView from './views/LoginView.vue'
import { createAuthService, type AuthSession } from './services/authService'
import { refreshSession } from './services/sessionService'

const router = useRouter()
const sessionKey = 'meetingflow.session'
const saved = typeof window === 'undefined' ? null : window.sessionStorage.getItem(sessionKey)
const currentSession = ref<AuthSession | null>(saved ? JSON.parse(saved) as AuthSession : null)
const auth = createAuthService()

onMounted(async () => {
  if (!currentSession.value) return
  currentSession.value = await refreshSession(currentSession.value, auth.currentUser)
  window.sessionStorage.setItem(sessionKey, JSON.stringify(currentSession.value))
})

function signIn(session: AuthSession) {
  currentSession.value = session
  window.sessionStorage.setItem(sessionKey, JSON.stringify(session))
  router.push('/dashboard')
}

function signOut() {
  currentSession.value = null
  window.sessionStorage.removeItem(sessionKey)
  router.push('/login')
}
</script>

<template>
  <LoginView v-if="!currentSession" @signed-in="signIn" />
  <App v-else :user="currentSession.user" :token="currentSession.token" @logout="signOut" />
</template>
