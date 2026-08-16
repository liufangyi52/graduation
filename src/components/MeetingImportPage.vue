<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Archive, CheckCircle2, FileText, RotateCcw, Sparkles, Upload, X, Zap } from 'lucide-vue-next'
import { createMeetingService, type AnalysisMode, type MeetingVersionSummary } from '../services/meetingService'
import type { Project } from '../services/workspaceService'
import { formatBeijingMinute } from '../utils/date'

const props = defineProps<{ token: string; projects: Project[] }>()
const emit = defineEmits<{ submitted: []; notice: [message: string] }>()
const router = useRouter()
const meetings = createMeetingService(props.token)
const projectId = ref('')
const title = ref('')
const meetingDate = ref(new Date().toISOString().slice(0, 16))
const attendees = ref('')
const sourceType = ref<'text' | 'file'>('text')
const content = ref('')
const file = ref<File | null>(null)
const preview = ref('')
const desensitize = ref(true)
const analysisMode = ref<AnalysisMode>('llm')
const notice = ref('')
const error = ref('')
const busy = ref(false)
const dragging = ref(false)
const versions = ref<MeetingVersionSummary[]>([])
const lastMeetingId = ref('')
const showVersions = ref(false)

const selectedProject = computed(() => props.projects.find((item) => item.id === projectId.value))
const canSubmit = computed(() => Boolean(projectId.value && title.value.trim() && meetingDate.value && (content.value.trim() || file.value) && !busy.value))
const fileSize = computed(() => file.value ? `${Math.max(1, Math.round(file.value.size / 1024))} KB` : '')

function draftKey() { return `meeting-draft:${props.token.slice(-12)}` }
function syncPreview() { preview.value = content.value.trim() }
function applyFile(next: File | null) {
  if (!next) return
  const valid = /^(text\/plain|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/.test(next.type) || /\.(txt|docx)$/i.test(next.name)
  if (!valid) { error.value = '仅支持 TXT 或 DOCX 文件'; return }
  if (next.size > 10 * 1024 * 1024) { error.value = '文件大小不能超过 10MB'; return }
  error.value = ''
  file.value = next
  sourceType.value = 'file'
  if (/\.txt$/i.test(next.name)) {
    void next.text().then((text) => { content.value = text; preview.value = text })
  } else {
    preview.value = 'DOCX 文件已选择，提交时将由服务端解析并生成原文预览。'
  }
}
function selectFile(event: Event) { applyFile((event.target as HTMLInputElement).files?.[0] ?? null) }
function onDrop(event: DragEvent) { dragging.value = false; applyFile(event.dataTransfer?.files?.[0] ?? null) }
function clearFile() { file.value = null; if (sourceType.value === 'file') sourceType.value = 'text'; if (!content.value.trim()) preview.value = '' }
function saveDraft() {
  localStorage.setItem(draftKey(), JSON.stringify({ projectId: projectId.value, title: title.value, meetingDate: meetingDate.value, attendees: attendees.value, content: content.value, desensitize: desensitize.value, analysisMode: analysisMode.value }))
  notice.value = '草稿已保存到当前浏览器'
}
function restoreDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(draftKey()) ?? 'null')
    if (!raw) return
    projectId.value = raw.projectId ?? ''
    title.value = raw.title ?? ''
    meetingDate.value = raw.meetingDate ?? meetingDate.value
    attendees.value = raw.attendees ?? ''
    content.value = raw.content ?? ''
    preview.value = content.value
    desensitize.value = raw.desensitize !== false
    analysisMode.value = raw.analysisMode ?? 'llm'
  } catch { localStorage.removeItem(draftKey()) }
}
async function submit() {
  if (!canSubmit.value) { error.value = '请填写项目、标题、会议时间，并粘贴或上传会议纪要'; return }
  busy.value = true; error.value = ''; notice.value = '正在导入并提交 AI 分析…'
  try {
    const metadata = { meetingAt: new Date(meetingDate.value).toISOString(), attendees: attendees.value.trim() || undefined, desensitize: desensitize.value }
    const meeting = file.value
      ? await meetings.importFile(projectId.value, title.value.trim(), file.value, metadata)
      : await meetings.create(projectId.value, title.value.trim(), content.value.trim(), metadata)
    await meetings.analyze(meeting.id, analysisMode.value)
    lastMeetingId.value = meeting.id
    versions.value = await meetings.listVersions(meeting.id)
    localStorage.removeItem(draftKey())
    emit('submitted')
    await router.push(`/meetings/${meeting.id}/review`)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '会议分析失败，请重试'
    notice.value = ''
  } finally { busy.value = false }
}
async function loadVersions() {
  if (!lastMeetingId.value) { notice.value = '提交一份会议纪要后才能查看版本记录'; return }
  try { versions.value = await meetings.listVersions(lastMeetingId.value); showVersions.value = true } catch (reason) { error.value = reason instanceof Error ? reason.message : '版本记录加载失败' }
}
async function retryPreview() { if (file.value) applyFile(file.value) }
watch(content, syncPreview)
onMounted(restoreDraft)
</script>

<template>
  <section class="page-section meeting-import-page">
    <div class="meeting-import-head">
      <div><p class="meeting-breadcrumb">会议纪要 / 新建</p><h1>导入会议纪要</h1><p class="meeting-subtitle">支持粘贴文本或上传 TXT、DOCX 文件，导入后可进行脱敏与 AI 分析。</p></div>
      <div class="meeting-import-actions"><button class="secondary-button" type="button" @click="saveDraft">保存草稿</button><button class="primary-button" type="button" :disabled="!canSubmit" @click="submit"><Zap :size="15" /> {{ busy ? '分析中…' : '提交 AI 分析' }}</button></div>
    </div>
    <p v-if="error" class="meeting-import-alert error" role="alert">{{ error }} <button type="button" @click="retryPreview"><RotateCcw :size="14" /> 重试</button></p>
    <p v-else-if="notice" class="meeting-import-alert success"><CheckCircle2 :size="15" /> {{ notice }}</p>
    <div class="meeting-import-grid">
      <article class="panel meeting-info-panel">
        <div class="meeting-panel-title"><Archive :size="18" /><h2>会议信息</h2></div>
        <label class="meeting-import-field"><span>所属项目 <b>*</b></span><select v-model="projectId"><option value="">请选择项目</option><option v-for="project in props.projects" :key="project.id" :value="project.id">{{ project.name }}</option></select></label>
        <label class="meeting-import-field"><span>会议标题 <b>*</b></span><input v-model="title" maxlength="180" placeholder="例如：8 月项目例会" /></label>
        <div class="meeting-two-fields"><label class="meeting-import-field"><span>会议时间 <b>*</b></span><input v-model="meetingDate" type="datetime-local" /></label><label class="meeting-import-field"><span>参会人</span><input v-model="attendees" placeholder="姓名、姓名" /></label></div>
        <label class="meeting-import-field"><span>来源类型</span><select v-model="sourceType"><option value="text">粘贴文本</option><option value="file">本地文件上传</option></select></label>
        <label class="meeting-import-field"><span>分析模式</span><select v-model="analysisMode"><option value="manual">人工审核</option><option value="llm">单轮大模型</option><option value="rag">RAG 检索增强</option><option value="agent">智能体编排</option></select></label>
        <div class="meeting-privacy-row"><div><strong>敏感信息脱敏</strong><small>提交分析前自动替换手机号、邮箱等敏感字段</small></div><button type="button" class="toggle" :class="{ on: desensitize }" :aria-pressed="desensitize" @click="desensitize = !desensitize"><i /></button></div>
        <div class="meeting-project-hint" v-if="selectedProject"><span>当前项目</span><strong>{{ selectedProject.name }}</strong></div>
      </article>
      <article class="panel meeting-upload-panel">
        <div class="meeting-panel-title"><Upload :size="18" /><h2>纪要文件</h2></div>
        <div class="meeting-drop-zone" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop"><FileText :size="24" /><strong>拖放文件至此处</strong><span>或点击选择文件 · 支持 TXT、DOCX，最大 10MB</span><label class="secondary-button file-picker"><Upload :size="14" /> 选择文件<input type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="selectFile" /></label></div>
        <div v-if="file" class="meeting-file-row"><span class="meeting-file-icon">{{ file.name.toLowerCase().endsWith('.docx') ? 'DOCX' : 'TXT' }}</span><div><strong>{{ file.name }}</strong><small>{{ fileSize }} · 已选择，提交时解析</small></div><button class="icon-button" type="button" title="移除文件" @click="clearFile"><X :size="16" /></button></div>
        <div v-if="!file && !content.trim()" class="meeting-upload-empty"><Sparkles :size="18" /><span>也可以直接在下方粘贴会议纪要</span></div>
        <label class="meeting-content-field"><span>会议纪要原文 <b>*</b></span><textarea v-model="content" rows="10" placeholder="粘贴会议纪要内容…" /></label>
      </article>
      <article class="panel meeting-preview-panel"><div class="meeting-preview-head"><div><div class="meeting-panel-title"><FileText :size="18" /><h2>原文预览</h2></div><p>当前内容 · {{ desensitize ? '提交后自动脱敏' : '未启用脱敏' }}</p></div><span class="tag" :class="content.trim() || file ? 'green' : 'gray'">{{ content.trim() || file ? '可分析' : '待输入' }}</span></div><div v-if="preview" class="meeting-preview-copy">{{ preview }}</div><div v-else class="meeting-preview-placeholder">完成左侧信息填写并粘贴文本或上传文件后，原文会显示在这里。</div><button class="meeting-version-button" type="button" @click="loadVersions"><RotateCcw :size="14" /> 版本记录</button></article>
    </div>
    <div v-if="showVersions" class="meeting-version-popover"><div class="meeting-version-popover-head"><strong>版本记录</strong><button class="icon-button" title="关闭" @click="showVersions = false"><X :size="15" /></button></div><div v-for="version in versions" :key="version.id" class="meeting-version-item"><span>版本 {{ version.versionNumber }}</span><small>{{ version.sourceType }} · {{ formatBeijingMinute(version.createdAt) }}</small><span v-if="version.current" class="tag green">当前</span></div><div v-if="!versions.length" class="empty-cell">暂无版本记录</div></div>
  </section>
</template>
