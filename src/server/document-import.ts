import mammoth from 'mammoth'
import { BadRequestException } from '@nestjs/common'

const maxFileBytes = 2 * 1024 * 1024
const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type UploadedMeetingFile = { originalname: string; mimetype: string; size: number; buffer: Buffer }

export async function extractMeetingFileContent(file?: UploadedMeetingFile): Promise<{ content: string; sourceType: 'txt' | 'docx' }> {
  if (!file) throw new BadRequestException('Meeting file is required')
  if (file.size > maxFileBytes) throw new BadRequestException('Meeting file must be 2 MiB or smaller')
  const extension = file.originalname.toLowerCase().split('.').pop()
  let content = ''
  if (extension === 'txt' && (!file.mimetype || file.mimetype.startsWith('text/'))) {
    content = file.buffer.toString('utf8')
  } else if (extension === 'docx' && (!file.mimetype || file.mimetype === docxMime || file.mimetype === 'application/octet-stream')) {
    content = (await mammoth.extractRawText({ buffer: file.buffer })).value
  } else {
    throw new BadRequestException('Only .txt and .docx meeting files are supported')
  }
  const normalized = content.trim()
  if (!normalized) throw new BadRequestException('Meeting file contains no readable text')
  return { content: normalized, sourceType: extension as 'txt' | 'docx' }
}
