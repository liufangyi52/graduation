import 'dotenv/config'
import { Injectable, ServiceUnavailableException } from '@nestjs/common'

export type CandidateTask = {
  title: string
  description?: string
  owner_email?: string
  due_date?: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
}

export type CandidateRisk = { title: string; description?: string; level: 'low' | 'medium' | 'high' }
export type MeetingAnalysis = { summary: string; decisions: string[]; tasks: CandidateTask[]; risks: CandidateRisk[] }

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string`)
  return value.trim()
}

export function normalizeAnalysis(input: any): MeetingAnalysis {
  const tasks = Array.isArray(input?.tasks) ? input.tasks.map((task: any) => ({
    title: stringValue(task?.title, 'task title'),
    description: typeof task?.description === 'string' ? task.description.trim() : undefined,
    owner_email: typeof task?.owner_email === 'string' ? task.owner_email.trim().toLowerCase() : undefined,
    due_date: typeof task?.due_date === 'string' && task.due_date.trim() ? task.due_date.trim() : undefined,
    priority: ['low', 'medium', 'high', 'urgent'].includes(task?.priority) ? task.priority : 'medium',
  })) : []
  const risks = Array.isArray(input?.risks) ? input.risks.map((risk: any) => ({
    title: stringValue(risk?.title, 'risk title'),
    description: typeof risk?.description === 'string' ? risk.description.trim() : undefined,
    level: ['low', 'medium', 'high'].includes(risk?.level) ? risk.level : 'medium',
  })) : []
  return {
    summary: stringValue(input?.summary, 'summary'),
    decisions: Array.isArray(input?.decisions) ? input.decisions.map((item: unknown) => stringValue(item, 'decision')) : [],
    tasks,
    risks,
  }
}

@Injectable()
export class DeepSeekService {
  async analyze(title: string, content: string): Promise<MeetingAnalysis> {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new ServiceUnavailableException('DeepSeek API key is not configured')
    const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
    const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你是会议纪要任务抽取助手。只返回 JSON：summary 字符串、decisions 字符串数组、tasks 数组（title,description,owner_email,due_date,priority）、risks 数组（title,description,level）。priority 只能是 low、medium、high、urgent；level 只能是 low、medium、high。' },
          { role: 'user', content: `会议标题：${title}\n会议纪要：\n${content}` },
        ],
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new ServiceUnavailableException(payload?.error?.message ?? 'DeepSeek request failed')
    try {
      return normalizeAnalysis(JSON.parse(payload?.choices?.[0]?.message?.content ?? '{}'))
    } catch (reason) {
      throw new ServiceUnavailableException(reason instanceof Error ? reason.message : 'DeepSeek response is invalid')
    }
  }
}
