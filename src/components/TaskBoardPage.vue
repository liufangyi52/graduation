<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createWorkspaceService, type Task, type TaskState } from '../services/workspaceService'
import type { UserAccount } from '../services/authService'
import { priorityLabel, taskStatusLabel } from '../utils/labels'
import { formatBeijingMinute } from '../utils/date'

const props = defineProps<{ token: string; user: UserAccount }>()
const route = useRoute()
const router = useRouter()
const service = createWorkspaceService(props.token)
const tasks = ref<Task[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const updatingTaskId = ref<string | null>(null)
const filters = ref({ project: '', assignee: '', status: '', priority: '', risk: '', dueFrom: '', dueTo: '', search: '' })
const states: Array<{ id: TaskState; label: string }> = [
  { id: 'todo', label: taskStatusLabel('todo').label },
  { id: 'in-progress', label: taskStatusLabel('in-progress').label },
  { id: 'completed', label: taskStatusLabel('completed').label },
  { id: 'closed', label: taskStatusLabel('closed').label },
]

function initFromQuery() {
  const query = route.query
  for (const key of Object.keys(filters.value) as Array<keyof typeof filters.value>) filters.value[key] = String(query[key] ?? '')
}

function syncQuery() {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters.value)) if (value) query[key] = value
  router.replace({ query })
}

const filtered = computed(() => tasks.value.filter((task) =>
  (!filters.value.search || `${task.title}${task.project}${task.owner}`.toLowerCase().includes(filters.value.search.toLowerCase()))
  && (!filters.value.project || task.projectId === filters.value.project)
  && (!filters.value.assignee || task.assigneeId === filters.value.assignee)
  && (!filters.value.status || task.state === filters.value.status)
  && (!filters.value.priority || task.rawPriority === filters.value.priority)
  && (!filters.value.risk || service.state.risks.some((risk) => risk.status !== '已处理' && `${risk.title}${risk.task}`.includes(task.id)))
  && (!filters.value.dueFrom || task.due >= filters.value.dueFrom)
  && (!filters.value.dueTo || task.due <= filters.value.dueTo),
))

const canRemind = computed(() => props.user.role === 'manager')

async function load() {
  loading.value = true
  try {
    await service.load()
    tasks.value = service.state.tasks.slice()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '任务加载失败'
  } finally {
    loading.value = false
  }
}

async function sendReminder(task: Task) {
  if (!canRemind.value || updatingTaskId.value || task.state === 'completed' || task.state === 'closed') return
  updatingTaskId.value = task.id
  error.value = ''
  notice.value = ''
  try {
    await service.remindTask(task.id)
    notice.value = `已向 ${task.owner} 发送推进提醒`
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '任务推进提醒发送失败'
  } finally {
    updatingTaskId.value = null
  }
}

watch(() => route.query, initFromQuery, { immediate: true })
watch(filters, syncQuery, { deep: true })
onMounted(load)
</script>

<template>
  <section class="page-section task-board-page">
    <div class="filter-bar board-filters">
      <input v-model="filters.search" class="search-filter" placeholder="搜索任务、项目或负责人" />
      <select v-model="filters.project">
        <option value="">全部项目</option>
        <option v-for="project in service.state.projects" :key="project.id" :value="project.id">{{ project.name }}</option>
      </select>
      <input v-model="filters.assignee" placeholder="负责人 ID" />
      <select v-model="filters.status">
        <option value="">全部状态</option>
        <option v-for="state in states" :key="state.id" :value="state.id">{{ state.label }}</option>
      </select>
      <select v-model="filters.priority">
        <option value="">全部优先级</option>
        <option value="urgent">紧急</option>
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <label class="risk-filter"><input v-model="filters.risk" type="checkbox" value="open" /> 未处理风险</label>
      <div class="date-filter">
        <input v-model="filters.dueFrom" type="date" aria-label="截止日期起始" />
        <input v-model="filters.dueTo" type="date" aria-label="截止日期结束" />
      </div>
    </div>

    <div v-if="loading" class="panel empty-cell">正在加载任务...</div>
    <div v-else-if="error" class="panel empty-cell">{{ error }} <button class="small-button" @click="load">重试</button></div>
    <article v-else class="panel table-panel">
      <div class="panel-heading"><h3>任务列表（{{ filtered.length }}）</h3></div>
      <p v-if="notice" class="success-text">{{ notice }}</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>任务</th><th>项目</th><th>负责人</th><th>优先级</th><th>截止日期</th><th>状态</th><th></th></tr></thead>
          <tbody>
            <tr v-for="task in filtered" :key="task.id">
              <td><strong>{{ task.title }}</strong></td>
              <td>{{ task.project }}</td>
              <td>{{ task.owner }}</td>
              <td><span class="tag" :class="priorityLabel(task.rawPriority || task.priority).tone">{{ priorityLabel(task.rawPriority || task.priority).label }}</span></td>
              <td>{{ formatBeijingMinute(task.due) }}</td>
              <td><span class="tag" :class="taskStatusLabel(task.state).tone">{{ taskStatusLabel(task.state).label }}</span></td>
              <td><button v-if="canRemind && task.state !== 'completed' && task.state !== 'closed'" class="small-button" :disabled="Boolean(updatingTaskId)" @click="sendReminder(task)">{{ updatingTaskId === task.id ? '发送中...' : '推进' }}</button></td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="7" class="empty-cell">暂无符合条件的任务</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>
