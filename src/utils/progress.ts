export function averageTaskProgress(tasks: { progress: number }[]): number | null {
  if (!tasks.length) return null
  return Math.round(tasks.reduce((total, task) => total + task.progress, 0) / tasks.length)
}
