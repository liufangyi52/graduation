import 'dotenv/config'
import { randomBytes, randomUUID } from 'node:crypto'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'
import { DeepSeekService, type MeetingAnalysis } from '../src/server/deepseek.service'

const projectCode = 'MEISHI-2026'
const meetingTitle = '美食记 APP 制作项目推进会议纪要'

const meetingContent = `会议主题：美食记APP最终落地、开发迭代、上线收尾任务部署
会议时间：2026年08月11日
会议形式：线上/线下项目推进会
参会人员：项目负责人、产品经理、UI设计师、前端开发、后端开发、测试人员、运营人员
会议目的：明确美食记APP最终版本功能、细化各岗位任务、敲定全部节点时间、闭环所有开发及上线准备工作，保障APP顺利最终上线呈现。

一、项目整体定位与最终交付标准
美食记APP是一款集美食打卡、食谱分享、本地美食探店、个人美食日记、美食收藏推荐于一体的生活化美食记录工具，面向普通美食爱好者、探店用户、居家做饭人群。最终上线标准：版本功能完整、UI全部落地、前后端接口打通、无重大缺陷、适配主流手机机型、测试验收通过，可直接上架应用市场。
核心功能：注册登录、个人中心与资料编辑、文字图片美食日记、食谱浏览分类详情收藏点赞、本地美食推荐和探店笔记、首页推荐动态、搜索、通知、设置、隐私协议、关于我们。

二、岗位任务与截止时间
项目负责人：每日跟进各岗位进度，协调跨岗位问题，把控风险，审核最终UI、功能和测试报告，批准上线；上线前全部闭环。
产品经理：确认产品需求、核对功能清单、输出最终原型和《美食记APP最终需求文档》《上线验收标准文档》，全程开发答疑；2026年08月13日前完成需求定稿和文档输出，后续跟进至上线。
UI设计师：完成首页、日记、食谱、探店、个人中心、设置、登录注册的最终视觉；统一配色字体间距和组件样式，完成多机型适配、高清切图和设计规范；2026年08月16日前完成UI定稿及切图，2026年08月18日前完成前端视觉适配修改收尾。
前端开发：完成所有页面、打卡发布收藏点赞搜索个人中心等交互，安卓和iOS适配，与后端接口联调，修复卡顿、错位和交互异常；2026年08月22日前完成页面和功能，2026年08月25日前完成前端缺陷修复。
后端开发：搭建用户、美食日记、食谱、探店、收藏、点赞、消息数据库；开发调试全部接口，完成数据安全、账号权限、图片上传存储、服务器部署和联调问题处理；2026年08月20日前完成接口开发和自测，2026年08月24日前完成联调收尾。
测试人员：完成全功能、兼容性、回归测试，统计缺陷并推动修复，出具最终测试报告；2026年08月26日至28日完成测试及缺陷闭环，2026年08月29日前出具正式测试验收报告。
运营人员：准备APP简介、功能介绍、截图、图标、隐私政策、用户协议和应用商店上架资料，并填充食谱和探店初始优质内容；2026年08月30日前完成。

三、总体排期
需求定稿：08月11日-08月13日；UI定稿交付：08月14日-08月16日；后端开发自测：08月15日-08月20日；前端开发联调：08月17日-08月24日；测试和回归：08月26日-08月28日；封版与上架资料核对：08月29日-08月30日；正式上线：2026年08月31日。

四、会议决议
各岗位严格按节点完成，问题至少提前24小时报备。每日同步进度，跨岗位问题即时解决。上线版本不新增临时需求，所有修复与调整均须测试回归。上线前全员核对UI、功能、内容与适配效果。`

const members = [
  { name: '美食记产品经理', email: 'product.manager@meishiji.local' },
  { name: '美食记UI设计师', email: 'ui.designer@meishiji.local' },
  { name: '美食记前端开发', email: 'frontend.developer@meishiji.local' },
  { name: '美食记后端开发', email: 'backend.developer@meishiji.local' },
  { name: '美食记测试人员', email: 'qa.engineer@meishiji.local' },
  { name: '美食记运营人员', email: 'operations@meishiji.local' },
]

const assignedTasks: MeetingAnalysis['tasks'] = [
  { title: '确认最终需求并输出上线验收文档', description: '敲定页面、弹窗和交互规则，删除冗余需求，补齐缺失逻辑，输出最终需求文档与上线验收标准。', owner_email: 'product.manager@meishiji.local', due_date: '2026-08-13', priority: 'urgent' },
  { title: '完成最终 UI 定稿、切图与设计规范', description: '完成全页面视觉优化、多机型适配设计，交付高清切图和设计规范文件。', owner_email: 'ui.designer@meishiji.local', due_date: '2026-08-16', priority: 'high' },
  { title: '完成前端视觉适配修改收尾', description: '配合前端完成视觉还原、组件样式和多机型适配修改。', owner_email: 'ui.designer@meishiji.local', due_date: '2026-08-18', priority: 'high' },
  { title: '完成后端接口开发与自测', description: '完成用户、日记、食谱、探店、收藏、点赞、消息数据库及接口，配置数据安全、权限、图片存储和服务器部署。', owner_email: 'backend.developer@meishiji.local', due_date: '2026-08-20', priority: 'urgent' },
  { title: '完成前端页面、交互及接口联调', description: '完成核心页面与打卡、发布、收藏、点赞、搜索、个人中心交互，完成安卓和 iOS 适配及接口联调。', owner_email: 'frontend.developer@meishiji.local', due_date: '2026-08-22', priority: 'urgent' },
  { title: '完成后端联调问题收尾', description: '解决接口报错、数据异常及前后端联调遗留问题。', owner_email: 'backend.developer@meishiji.local', due_date: '2026-08-24', priority: 'high' },
  { title: '完成前端缺陷修复', description: '修复页面卡顿、适配错位、交互异常等前端问题，并配合测试回归。', owner_email: 'frontend.developer@meishiji.local', due_date: '2026-08-25', priority: 'high' },
  { title: '完成全量测试与缺陷闭环', description: '覆盖功能、按钮、弹窗、页面跳转、数据提交、图片上传、登录注册、收藏点赞及多机型多系统兼容性测试。', owner_email: 'qa.engineer@meishiji.local', due_date: '2026-08-28', priority: 'urgent' },
  { title: '出具正式测试验收报告', description: '完成回归测试并出具最终上线测试验收报告。', owner_email: 'qa.engineer@meishiji.local', due_date: '2026-08-29', priority: 'urgent' },
  { title: '完成应用商店资料与初始内容筹备', description: '准备简介、功能介绍、截图、图标、隐私政策、用户协议、上架资料，并填充食谱和探店初始优质内容。', owner_email: 'operations@meishiji.local', due_date: '2026-08-30', priority: 'high' },
  { title: '完成上线审批与正式发布', description: '复核最终 UI、功能完整性和测试报告，完成上线审批对接并于 2026 年 08 月 31 日正式发布。', owner_email: 'xixi@163.com', due_date: '2026-08-31', priority: 'urgent' },
]

async function main() {
  const service = new AppService(new DeepSeekService())
  const [managerRows] = await pool.query<any[]>('SELECT id,role,name,email FROM users WHERE email=?', ['xixi@163.com'])
  const [adminRows] = await pool.query<any[]>('SELECT id,role,name,email FROM users WHERE email=?', ['xtgly@163.com'])
  const manager = managerRows[0]
  const admin = adminRows[0]
  if (!manager || manager.role !== 'manager') throw new Error('Required project manager account is unavailable')
  if (!admin || admin.role !== 'admin') throw new Error('Required administrator account is unavailable')

  for (const member of members) {
    const [existing] = await pool.query<any[]>('SELECT id FROM users WHERE email=?', [member.email])
    if (!existing.length) {
      const password = `${randomBytes(24).toString('base64url')}Aa1!`
      await service.createManagedUser(admin, { ...member, role: 'member', password })
    }
  }

  const [projectRows] = await pool.query<any[]>('SELECT id,owner_id FROM projects WHERE code=?', [projectCode])
  const project = projectRows[0] ?? await service.createProject(manager, {
    name: '美食记 APP 制作项目',
    code: projectCode,
    description: '美食打卡、食谱分享、本地探店与美食日记应用的最终上线项目。',
    endDate: '2026-08-31',
  })
  if (project.owner_id && project.owner_id !== manager.id) throw new Error('Existing project is owned by another manager')
  await pool.execute('UPDATE projects SET start_date=?, end_date=? WHERE id=?', ['2026-08-11', '2026-08-31', project.id])
  await pool.execute('INSERT IGNORE INTO project_members (project_id,user_id,project_role) VALUES (?,?,?)', [project.id, manager.id, 'manager'])
  for (const member of members) {
    const [rows] = await pool.query<any[]>('SELECT id FROM users WHERE email=?', [member.email])
    await pool.execute('INSERT IGNORE INTO project_members (project_id,user_id,project_role) VALUES (?,?,?)', [project.id, rows[0].id, 'member'])
  }

  const [meetingRows] = await pool.query<any[]>('SELECT id FROM meetings WHERE project_id=? AND title=?', [project.id, meetingTitle])
  const meeting = meetingRows[0] ?? await service.createMeeting(manager, { projectId: project.id, title: meetingTitle, content: meetingContent })
  const [approvedRows] = await pool.query<any[]>('SELECT id FROM ai_analyses WHERE meeting_id=? AND status="approved"', [meeting.id])
  if (approvedRows.length) {
    const [taskCount] = await pool.query<any[]>('SELECT COUNT(*) count FROM tasks WHERE project_id=?', [project.id])
    console.log(JSON.stringify({ projectId: project.id, meetingId: meeting.id, status: 'already_imported', tasks: taskCount[0].count }))
    return
  }

  const analysis = await service.analyzeMeeting(manager, meeting.id)
  const aiResult = analysis.result
  const result: MeetingAnalysis = {
    summary: aiResult.summary,
    decisions: aiResult.decisions,
    tasks: assignedTasks,
    risks: aiResult.risks.length ? aiResult.risks : [
      { title: '关键交付物延期影响联调', description: '需求与 UI 的定稿延期会直接压缩开发、联调和测试窗口。', level: 'high' },
      { title: '前后端接口与权限配置风险', description: '接口契约、数据权限、图片上传和服务器配置需在联调前完成自测。', level: 'high' },
      { title: '多机型兼容性与回归窗口不足', description: '测试阶段较短，需优先覆盖登录、上传、收藏点赞和核心页面适配。', level: 'medium' },
      { title: '上架资料与初始内容准备滞后', description: '隐私政策、商店素材和初始内容未按时完成会阻塞正式发布。', level: 'medium' },
    ],
  }
  await pool.execute('UPDATE ai_analyses SET result_json=? WHERE id=?', [JSON.stringify(result), analysis.id])
  await pool.execute('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?,?)', [randomUUID(), manager.id, 'analysis.assignment_enriched', 'analysis', analysis.id, JSON.stringify({ taskCount: assignedTasks.length })])
  await service.reviewAnalysis(manager, analysis.id, true)

  const [tasks] = await pool.query<any[]>('SELECT id,title,assignee_id,due_date FROM tasks WHERE project_id=?', [project.id])
  for (const task of tasks) {
    const [existing] = await pool.query<any[]>('SELECT id FROM notifications WHERE user_id=? AND link=?', [task.assignee_id, `/tasks/${task.id}`])
    if (!existing.length) await pool.execute('INSERT INTO notifications (id,user_id,title,body,link) VALUES (?,?,?,?,?)', [randomUUID(), task.assignee_id, '新任务已下发', `${task.title}，截止日期：${task.due_date ?? '未设置'}`, `/tasks/${task.id}`])
  }
  console.log(JSON.stringify({ projectId: project.id, meetingId: meeting.id, analysisId: analysis.id, status: 'approved', tasks: tasks.length, risks: result.risks.length }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(async () => {
  await pool.end()
})
