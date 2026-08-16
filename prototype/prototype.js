const screenTitles = {
  dashboard: '工作台', 'project-detail': '项目详情', 'meeting-import': '导入会议纪要',
  'ai-review': 'AI 复核', 'task-board': '任务看板', 'risk-center': '风险中心',
  'my-tasks': '我的任务', 'task-feedback': '任务反馈', settings: '系统设置', 'audit-log': '审计日志',
}
const requested = new URLSearchParams(window.location.search).get('screen')
const screen = Object.hasOwn(screenTitles, requested) ? requested : 'dashboard'
document.querySelectorAll('.prototype-screen').forEach((element) => element.classList.toggle('visible', element.dataset.screen === screen))
document.querySelector('#screen-title').textContent = screenTitles[screen]
document.title = `MeetingFlow - ${screenTitles[screen]}`
document.querySelectorAll('.nav-list a').forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `?screen=${screen}`))
const drawer = document.querySelector('#notification-drawer')
document.querySelector('#notification-toggle').addEventListener('click', () => { drawer.hidden = !drawer.hidden })
