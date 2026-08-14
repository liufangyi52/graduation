export type RagIndexRequestChannel = 'status' | 'summary' | 'sync'

export type RagIndexRequestToken = {
  channel: RagIndexRequestChannel
  projectId: string
  selectionRevision: number
  requestRevision: number
}

export function createRagIndexRequestGuard() {
  let selectionRevision = 0
  let selectedProjectId = ''
  const requestRevisions: Record<RagIndexRequestChannel, number> = { status: 0, summary: 0, sync: 0 }

  return {
    select(projectId: string) {
      selectedProjectId = projectId
      selectionRevision += 1
    },
    issue(channel: RagIndexRequestChannel, projectId: string): RagIndexRequestToken {
      requestRevisions[channel] += 1
      return { channel, projectId, selectionRevision, requestRevision: requestRevisions[channel] }
    },
    isCurrent(token: RagIndexRequestToken) {
      return selectedProjectId === token.projectId
        && selectionRevision === token.selectionRevision
        && requestRevisions[token.channel] === token.requestRevision
    },
  }
}
