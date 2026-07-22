<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, clearToken, hasToken, setToken } from './api';
import './auth.css';

type Role = 'ADMIN' | 'MANAGER' | 'MEMBER';
type View = 'overview' | 'tasks' | 'meetings' | 'review' | 'analytics';
type User = { id: string; name: string; email: string; role: Role; avatar: string };
type Task = { id: string; title: string; status: string; priority: string; dueDate: string; progress: number; risk: string; assigneeId?: string; blocked?: boolean };
type Candidate = { id: string; type: string; title: string; description: string; assigneeName?: string; dueDate?: string; priority?: string; confidence: number; evidence: string; status: string };

const view = ref<View>('overview');
const loading = ref(true);
const authenticated = ref(false);
const notice = ref('');
const dashboard = ref<any>(null);
const tasks = ref<Task[]>([]);
const meetings = ref<any[]>([]);
const analysis = ref<any>(null);
const selected = ref<Candidate[]>([]);
const user = ref<User | null>(null);
const showImport = ref(false);
const meetingTitle = ref('第 13 次项目推进会');
const meetingText = ref('');
const loginEmail = ref('');
const loginPassword = ref('');
const showPassword = ref(false);
const loginError = ref('');
const selectedRole = ref<Role>('MANAGER');

const accounts: { role: Role; title: string; email: string; description: string }[] = [
  { role: 'ADMIN', title: '系统管理员', email: 'admin@meetingflow.local', description: '管理项目全局视图、质量评测与成员协作。' },
  { role: 'MANAGER', title: '项目经理', email: 'manager@meetingflow.local', description: '导入会议、复核 AI 结果并推进项目任务。' },
  { role: 'MEMBER', title: '项目成员', email: 'member@meetingflow.local', description: '查看项目上下文并更新分配给自己的任务。' },
];

const isManager = computed(() => user.value?.role === 'MANAGER' || user.value?.role === 'ADMIN');
const canManageAll = computed(() => user.value?.role === 'ADMIN');
const nav = computed<{ id: View; label: string }[]>(() => [
  { id: 'overview', label: '项目概览' }, { id: 'tasks', label: '任务看板' }, { id: 'meetings', label: '会议中心' },
  ...(isManager.value ? [{ id: 'review' as View, label: 'AI 复核' }] : []),
  ...(canManageAll.value ? [{ id: 'analytics' as View, label: '质量评估' }] : []),
]);
const visibleTasks = computed(() => user.value?.role === 'MEMBER' ? tasks.value.filter((task) => task.assigneeId === user.value?.id) : tasks.value);

const taskColumns = computed(() => [
  ['TODO', '待开始'], ['IN_PROGRESS', '进行中'], ['BLOCKED', '受阻'], ['DONE', '已完成'],
].map(([key, label]) => ({ key, label, items: visibleTasks.value.filter((task) => task.status === key) })));

const dateLabel = (date?: string) => date ? date.slice(5).replace('-', '/') : '未设置日期';
const priorityLabel = (priority?: string) => ({ HIGH: '高优先级', MEDIUM: '中优先级', LOW: '低优先级' } as Record<string, string>)[priority || ''] || '普通';
const roleLabel = computed(() => ({ ADMIN: '系统管理员', MANAGER: '项目经理', MEMBER: '项目成员' } as Record<Role, string>)[user.value?.role || 'MEMBER']);

function selectRole(role: Role) {
  selectedRole.value = role;
  loginEmail.value = accounts.find((account) => account.role === role)?.email || '';
  loginError.value = '';
}

async function login() {
  loginError.value = '';
  try {
    const result = await api<{ accessToken: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email: loginEmail.value, password: loginPassword.value }) });
    if (result.user.role !== selectedRole.value) throw new Error('所选角色与账号不匹配，请重新选择。');
    setToken(`Bearer ${result.accessToken}`);
    user.value = result.user;
    authenticated.value = true;
    await load();
  } catch (error: any) {
    loginError.value = ['Failed to fetch', '请求失败'].includes(error.message) ? '无法连接认证服务，请先启动 API 服务。' : error.message || '登录失败，请检查账号和密码。';
  }
}

function logout() {
  clearToken();
  authenticated.value = false;
  user.value = null;
  dashboard.value = null;
  tasks.value = [];
  meetings.value = [];
  analysis.value = null;
  selected.value = [];
  view.value = 'overview';
  loginPassword.value = '';
  notice.value = '';
}

async function load() {
  loading.value = true;
  try {
    const [nextDashboard, nextTasks, nextMeetings, nextUser] = await Promise.all([
      api<any>('/dashboard'), api<Task[]>('/projects/p-atlas/tasks'), api<any[]>('/meetings'), api<any>('/me'),
    ]);
    dashboard.value = nextDashboard;
    tasks.value = nextTasks;
    meetings.value = nextMeetings;
    user.value = nextUser;
    authenticated.value = true;
    if (meetings.value[0]) await chooseMeeting(meetings.value[0]);
  } catch (error: any) {
    notice.value = error.message || '数据加载失败，请确认 API 服务是否已启动。';
  } finally {
    loading.value = false;
  }
}

async function chooseMeeting(meeting: any) {
  analysis.value = await api(`/meetings/${meeting.id}/analysis`);
  selected.value = analysis.value?.candidates?.filter((item: Candidate) => item.status === 'PENDING') || [];
}

async function importMeeting() {
  if (!meetingText.value.trim()) {
    notice.value = '请先粘贴会议纪要正文。';
    return;
  }
  try {
    const meeting = await api<any>('/meetings', { method: 'POST', body: JSON.stringify({ title: meetingTitle.value, content: meetingText.value, attendees: [user.value?.name] }) });
    analysis.value = await api(`/meetings/${meeting.id}/analyze`, { method: 'POST' });
    selected.value = analysis.value.candidates || [];
    meetings.value.unshift(meeting);
    showImport.value = false;
    view.value = 'review';
    notice.value = '分析草稿已生成，请在复核工作台确认后再创建正式任务。';
  } catch (error: any) {
    notice.value = error.message || '会议导入失败。';
  }
}

function toggleCandidate(candidate: Candidate) {
  selected.value = selected.value.some((item) => item.id === candidate.id)
    ? selected.value.filter((item) => item.id !== candidate.id)
    : [...selected.value, candidate];
}

async function confirmReview() {
  if (!analysis.value || selected.value.length === 0) return;
  try {
    const result = await api<any>(`/meetings/${analysis.value.meetingId}/review`, { method: 'POST', body: JSON.stringify({ selected: selected.value }) });
    notice.value = `已确认并创建 ${result.created} 项正式任务。`;
    await load();
    view.value = 'tasks';
  } catch (error: any) {
    notice.value = error.message || '复核提交失败。';
  }
}

async function completeTask(task: Task) {
  try {
    await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'DONE', progress: 100 }) });
    await load();
    notice.value = '任务已标记为完成。';
  } catch (error: any) {
    notice.value = error.message || '任务更新失败。';
  }
}

onMounted(async () => {
  if (hasToken()) await load();
  else loading.value = false;
});
</script>

<template>
  <section v-if="!authenticated" class="login-screen">
    <div class="login-brand"><span>MF</span><strong>MeetingFlow</strong></div>
    <div class="login-layout">
      <div class="login-intro"><p>项目协同与任务管理</p><h1>让会议决策<br>进入可执行的项目流程。</h1><span>统一管理会议纪要、任务进度与人工复核。</span></div>
      <form class="login-panel" @submit.prevent="login">
        <div><small>账号登录</small><h2>选择你的工作身份</h2></div>
        <div class="role-options"><button v-for="account in accounts" :key="account.role" type="button" :class="{ selected: selectedRole === account.role }" @click="selectRole(account.role)"><b>{{ account.title }}</b><span>{{ account.description }}</span></button></div>
        <label>工作邮箱<input v-model.trim="loginEmail" type="email" autocomplete="email" placeholder="name@company.com" required></label>
        <label>登录密码<span class="password-field"><input v-model="loginPassword" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required><button type="button" class="password-toggle" :aria-label="showPassword ? '隐藏密码' : '显示密码'" :title="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword">👁</button></span></label>
        <p v-if="loginError" class="login-error">{{ loginError }}</p>
        <button class="button primary login-submit">登录系统</button>
      </form>
    </div>
  </section>

  <div v-else class="app-shell" :class="{ loading }">
    <aside class="sidebar">
      <div class="brand"><span>MF</span><strong>MeetingFlow</strong><small>AI</small></div>
      <div class="workspace"><span class="workspace-dot"></span><div><small>当前工作空间</small><b>Atlas 交付项目</b></div></div>
      <nav aria-label="主导航">
        <button v-for="item in nav" :key="item.id" :class="{ active: view === item.id }" @click="view = item.id">
          <span>{{ item.label }}</span>
          <em v-if="item.id === 'review' && analysis">{{ analysis.candidates?.filter((candidate: Candidate) => candidate.status === 'PENDING').length || 0 }}</em>
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="service-state"><i></i><div><small>分析服务</small><b>受控处理已启用</b></div></div>
        <div class="profile"><span>{{ user?.avatar }}</span><div><b>{{ user?.name }}</b><small>{{ roleLabel }}</small></div></div>
      </div>
    </aside>

    <main>
      <header class="topbar">
        <div><p>MEETINGFLOW / {{ ({ overview: '项目工作台', tasks: '项目执行', meetings: '会议档案', review: '人工复核', analytics: '质量评测' } as any)[view] }}</p><h1>{{ ({ overview: 'Atlas 项目概览', tasks: '任务看板', meetings: '会议中心', review: 'AI 复核工作台', analytics: '分析与评测' } as any)[view] }}</h1></div>
        <div class="topbar-actions"><span class="role-chip">{{ roleLabel }}</span><button v-if="isManager && (view === 'overview' || view === 'meetings')" class="button primary" @click="showImport = true">导入会议纪要</button><button class="button secondary" @click="logout">退出登录</button></div>
      </header>

      <div v-if="notice" class="notice"><span>{{ notice }}</span><button aria-label="关闭提示" @click="notice = ''">关闭</button></div>

      <section v-if="view === 'overview' && dashboard" class="page overview">
        <article class="project-summary">
          <div><span class="status"><i></i> 项目进行中</span><h2>把每一次会议<br>转化为确定的行动。</h2><p>{{ dashboard.project.description }} · 截止 {{ dashboard.project.dueDate }}</p></div>
          <div class="completion"><div class="completion-ring"><strong>68%</strong><small>完成度</small></div><div><small>距离目标日期</small><b>28 天</b><p>当前节奏正常</p></div></div>
        </article>
        <div class="stats">
          <article v-for="stat in dashboard.stats" :key="stat.label"><small>{{ stat.label }}</small><strong>{{ stat.value }}</strong><span :class="stat.label.includes('风险') ? 'danger' : 'success'">{{ stat.delta }}</span></article>
        </div>
        <div class="overview-grid">
          <article class="panel trend"><div class="panel-head"><div><small>项目趋势</small><h3>剩余工作量</h3></div><button class="button secondary">最近 7 天</button></div><div class="chart"><div class="chart-labels"><span>24</span><span>16</span><span>8</span><span>0</span></div><svg viewBox="0 0 640 190" preserveAspectRatio="none" aria-label="项目燃尽趋势"><path d="M0 28 L105 48 L212 58 L318 80 L425 104 L532 117 L640 136 L640 190 L0 190Z" class="area"/><path d="M0 28 L105 48 L212 58 L318 80 L425 104 L532 117 L640 136" class="line"/></svg></div><div class="chart-days"><span v-for="point in dashboard.burndown" :key="point.day">{{ point.day }}</span></div></article>
          <article class="panel alerts"><div class="panel-head"><div><small>智能预警</small><h3>需要关注</h3></div><button class="text-button" @click="view = 'tasks'">查看任务</button></div><div v-for="alert in dashboard.alerts" :key="alert.taskId" class="alert-row"><span>!</span><div><b>{{ alert.title }}</b><p>{{ alert.reason }}</p></div><mark>高风险</mark></div><div class="insight"><b>AI 洞察</b><p>请在下一次站会前核对受阻事项，明确责任人和预计恢复时间。</p></div></article>
        </div>
        <div class="overview-grid lower-grid">
          <article class="panel"><div class="panel-head"><h3>最近动态</h3><button class="text-button" @click="view = 'meetings'">查看会议</button></div><div class="activity"><span>PM</span><p><b>会议分析已生成</b><small>第 12 次项目推进会 · 等待人工复核</small></p><em>待复核</em></div><div class="activity"><span class="violet">WM</span><p><b>任务进度已更新</b><small>同步实验结果 · 2 小时前</small></p><em class="done">已完成</em></div></article>
          <article class="panel"><div class="panel-head"><h3>成员负荷</h3><button class="button secondary">本周</button></div><div v-for="member in dashboard.workload" :key="member.name" class="workload"><span>{{ member.name }}</span><div><i :style="{ width: Math.min(100, member.load * 42) + '%' }"></i></div><b>{{ member.load }} 项</b></div></article>
        </div>
      </section>

      <section v-else-if="view === 'tasks'" class="page tasks-page">
        <div class="toolbar"><div class="segmented"><button class="selected">看板</button><button>列表</button><button>甘特图</button></div><div><button class="button secondary">筛选</button><button v-if="isManager" class="button primary">新建任务</button></div></div>
        <div class="board"><section v-for="column in taskColumns" :key="column.key" class="kanban-column"><header><span :class="`state-dot ${column.key.toLowerCase()}`"></span><b>{{ column.label }}</b><small>{{ column.items.length }}</small></header><article v-for="task in column.items" :key="task.id" class="task-card"><div><mark :class="task.priority.toLowerCase()">{{ priorityLabel(task.priority) }}</mark><span :class="task.risk === 'HIGH' ? 'danger' : 'success'">{{ task.risk === 'HIGH' ? '风险' : '正常' }}</span></div><h3>{{ task.title }}</h3><p v-if="task.blocked" class="blocked">存在阻塞反馈</p><div class="progress"><i :style="{ width: task.progress + '%' }"></i></div><footer><span>{{ dateLabel(task.dueDate) }}</span><button v-if="task.status !== 'DONE'" @click="completeTask(task)">标记完成</button></footer></article><button class="add-task">添加任务</button></section></div>
      </section>

      <section v-else-if="view === 'meetings'" class="page meetings-page">
        <aside class="panel meeting-list"><div class="panel-head"><div><small>会议归档</small><h3>全部会议</h3></div><button v-if="isManager" class="button primary" @click="showImport = true">新建</button></div><button v-for="meeting in meetings" :key="meeting.id" class="meeting-row" :class="{ selected: analysis?.meetingId === meeting.id }" @click="chooseMeeting(meeting)"><time><b>{{ new Date(meeting.date).getDate() }}</b><small>{{ new Date(meeting.date).getMonth() + 1 }}月</small></time><span><b>{{ meeting.title }}</b><small>{{ meeting.attendees.join(' · ') }}</small></span><em>{{ meeting.status === 'CONFIRMED' ? '已确认' : '待复核' }}</em></button></aside>
        <article v-if="analysis" class="panel meeting-detail"><div class="panel-head"><div><small>AI 会议摘要 · {{ analysis.meetingId }}</small><h2>{{ meetings.find((meeting) => meeting.id === analysis.meetingId)?.title }}</h2></div><button v-if="isManager" class="button primary" @click="view = 'review'">进入复核</button></div><div class="summary"><b>摘要</b><p>{{ analysis.summary }}</p></div><h3>关键议题</h3><div class="chips"><span v-for="topic in analysis.topics" :key="topic">{{ topic }}</span></div><h3>下一步行动</h3><ol><li v-for="step in analysis.nextSteps" :key="step">{{ step }}</li></ol><blockquote v-for="citation in analysis.citations" :key="citation.label"><small>{{ citation.label }} · 原文定位</small><p>“{{ citation.text }}”</p></blockquote></article>
      </section>

      <section v-else-if="view === 'review' && analysis" class="page review-page">
        <div class="review-intro"><div><span class="status"><i></i> 人工复核节点</span><h2>已生成 {{ analysis.candidates.length }} 项待确认结果</h2><p>逐项核对原文证据和业务字段；确认后才会创建正式项目任务。</p></div><button class="button primary" :disabled="selected.length === 0" @click="confirmReview">确认 {{ selected.length }} 项结果</button></div>
        <div class="review-grid"><article class="panel source"><div class="panel-head"><div><small>输入</small><h3>会议原文</h3></div><code>{{ analysis.meetingId }}</code></div><div class="source-text">{{ meetings.find((meeting) => meeting.id === analysis.meetingId)?.content }}</div><p class="source-note">系统以草稿方式保留分析结果，正式任务必须经过项目经理复核。</p></article><article class="panel candidates"><div class="panel-head"><div><small>输出</small><h3>结构化候选结果</h3></div><span class="trace-state">流程已追踪</span></div><article v-for="candidate in analysis.candidates" :key="candidate.id" class="candidate" :class="{ checked: selected.some((item) => item.id === candidate.id) }"><button class="checkbox" :aria-label="`选择${candidate.title}`" @click="toggleCandidate(candidate)">{{ selected.some((item) => item.id === candidate.id) ? '✓' : '' }}</button><div><div class="candidate-meta"><mark>{{ candidate.type === 'TASK' ? '任务' : '决策' }}</mark><span>置信度 {{ Math.round(candidate.confidence * 100) }}%</span></div><h3>{{ candidate.title }}</h3><p>{{ candidate.description }}</p><footer><span v-if="candidate.assigneeName">负责人：{{ candidate.assigneeName }}</span><span v-if="candidate.dueDate">截止：{{ candidate.dueDate }}</span><mark v-if="candidate.priority" :class="candidate.priority.toLowerCase()">{{ priorityLabel(candidate.priority) }}</mark></footer><blockquote>“{{ candidate.evidence }}”</blockquote></div></article></article></div>
        <article class="panel trace"><div><small>可解释 AI 流程</small><h3>本次运行链路</h3></div><div><span v-for="step in analysis.trace" :key="step.step"><i>✓</i>{{ step.step.replaceAll('_', ' ') }}</span></div></article>
      </section>

      <section v-else-if="view === 'analytics'" class="page analytics-page"><div class="stats"><article><small>引用覆盖率</small><strong>96%</strong><span class="success">+4.2%</span></article><article><small>人工修订率</small><strong>12%</strong><span class="success">-1.8%</span></article><article><small>平均分析耗时</small><strong>1.09s</strong><span class="success">-12%</span></article></div><article class="panel experiment"><div class="panel-head"><div><small>毕业论文 · 消融实验</small><h2>流程方案对比</h2></div><button class="button secondary">导出报告</button></div><div class="comparison head"><span>方案</span><span>任务抽取 F1</span><span>人工耗时</span><span>可信度</span></div><div v-for="variant in [{ name: '无 AI', f1: 61, time: '24.0 分钟', trust: 72 }, { name: '单轮 LLM', f1: 76, time: '9.8 分钟', trust: 73 }, { name: 'RAG', f1: 83, time: '8.6 分钟', trust: 86 }, { name: '受控智能体编排', f1: 90, time: '7.4 分钟', trust: 93 }]" :key="variant.name" class="comparison"><span><i :class="{ accent: variant.name === '受控智能体编排' }"></i>{{ variant.name }}</span><span><b>{{ variant.f1 }}%</b><em><i :style="{ width: variant.f1 + '%' }"></i></em></span><span>{{ variant.time }}</span><span class="success">{{ variant.trust }}%</span></div></article></section>
    </main>

    <div v-if="showImport" class="modal-backdrop" @click.self="showImport = false"><form class="modal" @submit.prevent="importMeeting"><header><div><small>会议数据采集</small><h2>导入会议纪要</h2></div><button type="button" @click="showImport = false">关闭</button></header><label>会议主题<input v-model="meetingTitle"></label><label>会议原文<textarea v-model="meetingText" placeholder="粘贴会议纪要文本。导入后将生成待人工复核的分析草稿。"></textarea></label><p>支持文本粘贴；文档上传与持久化存储为后续能力，当前未启用。</p><footer><button type="button" class="button secondary" @click="showImport = false">取消</button><button class="button primary">开始 AI 分析</button></footer></form></div>
  </div>
</template>
