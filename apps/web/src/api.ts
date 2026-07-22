const base = import.meta.env.VITE_API_BASE_URL || '/api';
let token = localStorage.getItem('meetingflow-auth-token') || '';
export function setToken(value: string) { token = value; localStorage.setItem('meetingflow-auth-token', value); }
export function clearToken() { token = ''; localStorage.removeItem('meetingflow-auth-token'); localStorage.removeItem('meetingflow-token'); }
export function hasToken() { return Boolean(token); }
export async function api<T>(path:string, options:RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, { ...options, headers:{ 'Content-Type':'application/json', Authorization:token, ...(options.headers||{}) } });
  if(!res.ok) throw new Error((await res.json().catch(()=>({message:'请求失败'}))).message || '请求失败');
  return res.json();
}
