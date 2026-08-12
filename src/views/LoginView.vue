<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound, UsersRound } from 'lucide-vue-next'
import { createAuthService, roleLabels, type AuthSession, type UserRole } from '../services/authService'
import { passwordInputType } from './loginForm'

const emit = defineEmits<{ signedIn: [session: AuthSession] }>()
const auth = createAuthService()
const mode = ref<'login' | 'register'>('login')
const form = ref({ role: 'member' as UserRole, name: '', email: '', password: '' })
const error = ref('')
const notice = ref('')
const showPassword = ref(false)
const roles: { value: UserRole; intro: string }[] = [
  { value: 'manager', intro: '统筹项目、审核 AI 结果与处置风险' },
  { value: 'member', intro: '查看个人任务、提交进度与问题反馈' },
  { value: 'admin', intro: '维护账号、系统配置与全局数据' },
  { value: 'auditor', intro: '追溯操作记录与审计证据' },
]
const title = computed(() => mode.value === 'login' ? '欢迎回来' : '创建协作账户')

async function submit() {
  error.value = ''
  notice.value = ''
  try {
    if (mode.value === 'register') {
      if (!form.value.name.trim()) throw new Error('请填写姓名')
      if (!/^\S+@\S+\.\S+$/.test(form.value.email)) throw new Error('请输入正确的邮箱地址')
      if (form.value.password.length < 8) throw new Error('密码至少需要 8 位')
      await auth.register({ ...form.value, name: form.value.name.trim() })
      notice.value = '注册成功，请使用刚创建的邮箱和密码登录。'
      mode.value = 'login'
      return
    }
    emit('signedIn', await auth.login(form.value.email, form.value.password))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '操作失败，请稍后重试'
  }
}

function switchMode(next: 'login' | 'register') {
  mode.value = next
  error.value = ''
  notice.value = ''
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-brand-panel">
      <div class="auth-brand"><span class="auth-mark"><Sparkles :size="20" /></span><div><strong>智策项目管理</strong><small>AI-DRIVEN INTELLIGENCE</small></div></div>
      <div class="auth-hero"><p>PROJECT COLLABORATION PLATFORM</p><h1>让每一项会议决策<br />都有清晰的执行轨迹。</h1><span>从会议纪要解析、任务协作到风险预警，帮助不同角色在同一个可信的工作空间中协同推进。</span></div>
      <div class="auth-proof"><div><CheckCircle2 :size="17" /><span>角色化数据视图</span></div><div><ShieldCheck :size="17" /><span>权限边界清晰</span></div><div><UsersRound :size="17" /><span>跨角色协同</span></div></div>
    </section>

    <section class="auth-form-panel">
      <div class="auth-form-wrap">
        <div class="auth-tabs"><button :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</button><button :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</button></div>
        <p class="auth-kicker">{{ mode === 'login' ? 'SIGN IN' : 'REGISTER ACCOUNT' }}</p><h2>{{ title }}</h2><p class="auth-subtitle">{{ mode === 'login' ? '输入账号信息，进入你的专属工作空间。' : '选择适用角色，创建一个本地演示账户。' }}</p>
        <div v-if="notice" class="auth-notice"><CheckCircle2 :size="16" />{{ notice }}</div>
        <div v-if="error" class="auth-error">{{ error }}</div>
        <form @submit.prevent="submit">
          <template v-if="mode === 'register'">
            <label class="auth-label"><span>选择角色</span><select v-model="form.role"><option v-for="role in roles" :key="role.value" :value="role.value">{{ roleLabels[role.value] }}</option></select><small>{{ roles.find((role) => role.value === form.role)?.intro }}</small></label>
            <label class="auth-label"><span>姓名</span><div class="auth-input"><UserRound :size="16" /><input v-model="form.name" autocomplete="name" placeholder="请输入姓名" /></div></label>
          </template>
          <label class="auth-label"><span>邮箱</span><div class="auth-input"><Mail :size="16" /><input v-model="form.email" type="email" autocomplete="email" placeholder="name@example.com" /></div></label>
          <label class="auth-label"><span>密码</span><div class="auth-input"><LockKeyhole :size="16" /><input v-model="form.password" :type="passwordInputType(showPassword)" autocomplete="current-password" placeholder="至少 8 位字符" /><button class="password-toggle" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword"><EyeOff v-if="showPassword" :size="16" /><Eye v-else :size="16" /></button></div></label>
          <button class="auth-submit" type="submit">{{ mode === 'login' ? '登录工作台' : '创建账户' }} <ArrowRight :size="17" /></button>
        </form>
      </div>
    </section>
  </main>
</template>

<style scoped>
.auth-page { min-height: 100vh; display: grid; grid-template-columns: minmax(420px, 1.05fr) minmax(480px, .95fr); color: #0b1c30; background: #f8f9ff; font-family: Inter, sans-serif; }
.auth-brand-panel { position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; padding: 46px clamp(42px, 7vw, 110px); color: #eaf1ff; background: #002045; }.auth-brand-panel::after { content: ''; position: absolute; right: -12%; bottom: -25%; width: 560px; height: 560px; border: 1px solid rgba(173,199,247,.25); border-radius: 50%; box-shadow: 0 0 0 55px rgba(173,199,247,.04), 0 0 0 110px rgba(173,199,247,.035); }
.auth-brand, .auth-proof, .auth-hero { position: relative; z-index: 1; }.auth-brand { display: flex; align-items: center; gap: 11px; }.auth-mark { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 6px; color: #002045; background: #66affe; }.auth-brand strong, .auth-brand small { display: block; }.auth-brand strong { font-size: 17px; }.auth-brand small { margin-top: 4px; color: #adc7f7; font: 700 9px/1 Inter; letter-spacing: .1em; }.auth-hero { max-width: 520px; margin: auto 0; }.auth-hero p, .auth-kicker { margin: 0; color: #66affe; font-size: 10px; font-weight: 700; letter-spacing: .1em; }.auth-hero h1 { margin: 17px 0; font-size: clamp(31px, 3.1vw, 48px); line-height: 1.15; letter-spacing: -.05em; }.auth-hero span { max-width: 480px; display: block; color: #adc7f7; font-size: 14px; line-height: 1.8; }.auth-proof { display: flex; gap: 22px; }.auth-proof div { display: flex; align-items: center; gap: 7px; color: #adc7f7; font-size: 11px; }.auth-proof svg { color: #66affe; }
.auth-form-panel { display: grid; place-items: center; padding: 42px; }.auth-form-wrap { width: min(390px, 100%); }.auth-tabs { display: flex; width: 138px; margin-bottom: 36px; border-bottom: 1px solid #e2e8f0; }.auth-tabs button { flex: 1; padding: 0 0 10px; color: #74777f; background: transparent; font-size: 13px; }.auth-tabs button.active { color: #002045; border-bottom: 2px solid #0061a5; font-weight: 700; }.auth-form-wrap h2 { margin: 8px 0; font-size: 29px; letter-spacing: -.04em; }.auth-subtitle { margin: 0 0 24px; color: #687386; font-size: 13px; line-height: 1.7; }.auth-label { display: block; margin-top: 15px; }.auth-label > span { display: block; margin-bottom: 7px; font-size: 11px; font-weight: 700; }.auth-label select { width: 100%; height: 39px; padding: 0 10px; border: 1px solid #c4c6cf; border-radius: 4px; color: #0b1c30; background: #fff; outline: 0; font-size: 12px; }.auth-label small { display: block; margin-top: 5px; color: #687386; font-size: 10px; }.auth-input { height: 39px; display: flex; align-items: center; gap: 9px; padding: 0 10px; border: 1px solid #c4c6cf; border-radius: 4px; color: #74777f; background: #fff; }.auth-input:focus-within, .auth-label select:focus { border-color: #0061a5; box-shadow: 0 0 0 2px rgba(0,97,165,.12); }.auth-input input { min-width: 0; flex: 1; border: 0; outline: 0; color: #0b1c30; background: transparent; font-size: 12px; }.password-toggle { width: 26px; height: 26px; display: grid; place-items: center; flex: none; border-radius: 3px; color: #687386; background: transparent; }.password-toggle:hover { color: #0061a5; background: #eff4ff; }.password-toggle:focus-visible { outline: 2px solid #0061a5; outline-offset: 1px; }.auth-submit { width: 100%; height: 42px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 26px; border-radius: 4px; color: #fff; background: #002045; font-size: 13px; font-weight: 700; }.auth-submit:hover { opacity: .9; }.auth-error, .auth-notice { display: flex; align-items: center; gap: 7px; margin: 14px 0 -2px; padding: 9px 10px; border-radius: 4px; font-size: 11px; }.auth-error { color: #93000a; background: #ffdad6; }.auth-notice { color: #08734d; background: #d9f8ea; }
@media (max-width: 900px) { .auth-page { grid-template-columns: 1fr; }.auth-brand-panel { min-height: 280px; padding: 32px; }.auth-hero { margin: 44px 0 0; }.auth-hero h1 { font-size: 30px; }.auth-proof { display: none; }.auth-form-panel { padding: 40px 24px; } }
</style>
