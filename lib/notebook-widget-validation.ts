import type { NotebookWidgetMetadata } from '../components/notebook/types'
import { notebookWidgetMetadataSchema } from './notebook-widgets'

export type WidgetValidationMessages = Partial<
  Record<'key' | 'label' | 'options' | 'optionsQuery' | 'startKey' | 'endKey' | 'general', string[]>
>

export function getWidgetValidationMessages(metadata: NotebookWidgetMetadata, extraMessages: Partial<WidgetValidationMessages> = {}) {
  const messages: WidgetValidationMessages = {}
  const parsed = notebookWidgetMetadataSchema.safeParse(metadata)

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const target = mapIssuePathToField(issue.path.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number'))
      appendMessage(messages, target, issue.message)
    }
  }

  for (const [field, fieldMessages] of Object.entries(extraMessages) as Array<[keyof WidgetValidationMessages, string[] | undefined]>) {
    for (const message of fieldMessages || []) appendMessage(messages, field, message)
  }

  return messages
}

export function countWidgetValidationMessages(messages: WidgetValidationMessages) {
  return Object.values(messages).reduce((sum, current) => sum + (current?.length || 0), 0)
}

function appendMessage(target: WidgetValidationMessages, field: keyof WidgetValidationMessages, message: string) {
  if (!target[field]) target[field] = []
  target[field]!.push(message)
}

function mapIssuePathToField(path: Array<string | number>): keyof WidgetValidationMessages {
  const first = path[0]
  const second = path[1]

  if (first === 'key') return 'key'
  if (first === 'label') return 'label'
  if (first === 'options') return 'options'
  if (first === 'config' && second === 'optionsQuery') return 'optionsQuery'
  if (first === 'config' && second === 'startKey') return 'startKey'
  if (first === 'config' && second === 'endKey') return 'endKey'
  return 'general'
}
