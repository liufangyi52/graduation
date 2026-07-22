import { Injectable, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Analysis, Candidate, Meeting, Role, Task, User } from './models';

@Injectable()
export class DemoService {
  readonly users: User[] = [
    { id:'u-admin', name:'林晓', email:'admin@meetingflow.local', role:'ADMIN', avatar:'LX' },
    { id:'u-manager', name:'陈一鸣', email:'manager@meetingflow.local', role:'MANAGER', avatar:'CY' },
    { id:'u-member', name:'王敏', email:'member@meetingflow.local', role:'MEMBER', avatar:'WM' },
    { id:'u-dev', name:'赵云', email:'dev@meetingflow.local', role:'MEMBER', avatar:'ZY' },
  ];
  readonly project = { id:'p-atlas', name:'Atlas 智能协作平台', code:'ATLAS', description:'将会议决策转化为可执行项目行动。', progress:68, dueDate:'2026-08-18', managerId:'u-manager' };
  tasks: Task[] = [
    { id:'t-1', title:'完成检索引用组件', projectId:'p-atlas', assigneeId:'u-dev', status:'IN_PROGRESS', priority:'HIGH', dueDate:'2026-07-25', progress:70, risk:'MEDIUM' },
    { id:'t-2', title:'接入会议纪要解析', projectId:'p-atlas', assigneeId:'u-member', status:'TODO', priority:'HIGH', dueDate:'2026-07-23', progress:20, risk:'HIGH', blocked:true },
    { id:'t-3', title:'完成答辩演示脚本', projectId:'p-atlas', assigneeId:'u-manager', status:'TODO', priority:'MEDIUM', dueDate:'2026-07-30', progress:0, risk:'LOW' },
    { id:'t-4', title:'补充消融实验结果', projectId:'p-atlas', assigneeId:'u-member', status:'DONE', priority:'MEDIUM', dueDate:'2026-07-18', progress:100, risk:'LOW' },
  ];
  meetings: Meeting[] = [{ id:'m-1', projectId:'p-atlas', title:'第 12 次项目推进会', date:'2026-07-21T09:30:00', attendees:['陈一鸣','王敏','赵云'], status:'REVIEW_REQUIRED', content:'陈一鸣：本周优先完成会议纪要解析和检索引用。王敏负责会议纪要解析模块，7月23日前提交可演示版本。赵云继续完善检索引用组件，本周五前联调。当前 PDF 解析存在兼容性问题，可能影响进度。下周一召开复盘会，确认答辩演示脚本。' }];
  analyses = new Map<string, Analysis>();
  login(email: string, password: string) {
    const user = this.users.find(u => u.email === email);
    if (!user || password !== 'meetingflow2026') throw new UnauthorizedException('账号或密码错误');
    return { accessToken:`demo.${user.id}`, user };
  }
  userFromToken(auth?: string) { const id = auth?.replace('Bearer demo.', ''); return this.users.find(u=>u.id===id) || this.users[1]; }
  dashboard() { const done = this.tasks.filter(t=>t.status==='DONE').length; const risks = this.tasks.filter(t=>t.risk==='HIGH'); return { project:this.project, stats:[{label:'项目进度',value:'68%',delta:'+8.4%'},{label:'待复核结果',value:String(this.meetings.filter(m=>m.status==='REVIEW_REQUIRED').length),delta:'需要处理'},{label:'高风险任务',value:String(risks.length),delta:'需关注'},{label:'本周完成',value:`${done}/6`,delta:'目标 6 项'}], burndown:[{day:'07/15',remaining:21},{day:'07/16',remaining:19},{day:'07/17',remaining:18},{day:'07/18',remaining:16},{day:'07/19',remaining:14},{day:'07/20',remaining:13},{day:'07/21',remaining:11}], workload:this.users.slice(1).map(u=>({name:u.name,load:this.tasks.filter(t=>t.assigneeId===u.id&&t.status!=='DONE').length})), alerts:risks.map(t=>({taskId:t.id,title:t.title,reason:'截止时间临近且存在阻塞反馈',level:t.risk})) }; }
  ensureManager(user: User) { if (user.role === 'MEMBER') throw new ForbiddenException('仅项目经理或管理员可执行此操作'); }
  createMeeting(input: Partial<Meeting>) { const meeting: Meeting = { id:`m-${Date.now()}`, projectId:'p-atlas', title:input.title || '未命名会议', date:input.date || new Date().toISOString(), attendees:input.attendees || [], content:input.content || '', status:'DRAFT' }; this.meetings.unshift(meeting); return meeting; }
  analyze(id: string) { const meeting=this.meetings.find(m=>m.id===id); if(!meeting) throw new NotFoundException('会议不存在'); meeting.status='REVIEW_REQUIRED'; const content=meeting.content; const candidates: Candidate[]=[
    {id:'c-1',type:'TASK',title:'完成会议纪要解析模块',description:'交付可演示的文本与 PDF 解析能力。',assigneeName:'王敏',dueDate:'2026-07-23',priority:'HIGH',confidence:0.96,evidence:'王敏负责会议纪要解析模块，7月23日前提交可演示版本。',status:'PENDING'},
    {id:'c-2',type:'TASK',title:'完善检索引用组件并联调',description:'完成来源引用组件，与纪要解析结果联调。',assigneeName:'赵云',dueDate:'2026-07-25',priority:'HIGH',confidence:0.91,evidence:'赵云继续完善检索引用组件，本周五前联调。',status:'PENDING'},
    {id:'c-3',type:'DECISION',title:'下周一召开答辩演示复盘会',description:'确认答辩演示脚本与材料。',confidence:0.88,evidence:'下周一召开复盘会，确认答辩演示脚本。',status:'PENDING'}
  ]; const a:Analysis={meetingId:id, summary:'本次会议聚焦会议纪要解析与检索引用两项核心能力。解析模块需在 7 月 23 日交付演示版本；PDF 兼容性问题已被识别为当前进度风险。',topics:['纪要解析','检索引用','答辩准备'],nextSteps:['完成解析模块','完成引用组件联调','处理 PDF 兼容性风险'],citations:[{label:'任务承诺',text:candidates[0].evidence,start:content.indexOf('王敏')},{label:'风险来源',text:'当前 PDF 解析存在兼容性问题，可能影响进度。',start:content.indexOf('PDF')}],candidates,trace:[{step:'文本脱敏与切分',status:'completed',durationMs:38},{step:'项目知识检索',status:'completed',durationMs:126},{step:'结构化任务抽取',status:'completed',durationMs:842},{step:'业务规则校验',status:'completed',durationMs:21},{step:'证据对齐',status:'completed',durationMs:64}]}; this.analyses.set(id,a); return a; }
  review(id:string, user:User, selected: Candidate[]) { this.ensureManager(user); const analysis=this.analyses.get(id); if(!analysis) throw new NotFoundException('请先执行 AI 分析'); selected.filter(c=>c.type==='TASK').forEach(c=>{ const assignee=this.users.find(u=>u.name===c.assigneeName); this.tasks.unshift({id:`t-${Date.now()}-${c.id}`,title:c.title,projectId:'p-atlas',assigneeId:assignee?.id,status:'TODO',priority:c.priority||'MEDIUM',dueDate:c.dueDate||'2026-08-01',progress:0,risk:c.priority==='HIGH'?'MEDIUM':'LOW',sourceMeetingId:id}); }); analysis.candidates.forEach(c=>c.status=selected.some(s=>s.id===c.id)?'CONFIRMED':'REJECTED'); const meeting=this.meetings.find(m=>m.id===id)!; meeting.status='CONFIRMED'; return { created:selected.filter(c=>c.type==='TASK').length, meeting }; }
  updateTask(id:string, user:User, patch:Partial<Task>) { const task=this.tasks.find(t=>t.id===id); if(!task) throw new NotFoundException('任务不存在'); if(user.role==='MEMBER' && task.assigneeId!==user.id) throw new ForbiddenException('只能更新本人任务'); Object.assign(task, patch); return task; }
}
