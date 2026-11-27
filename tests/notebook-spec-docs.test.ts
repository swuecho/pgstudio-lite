import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { notebookSpecV1Schema } from '@/lib/notebook-spec'
import { notebookWidgetTypeSchema } from '@/lib/notebook-widgets'

/**
 * The notebook docs are what coding agents read to write notebooks, so they
 * must describe what the server accepts. These checks failed silently once
 * already: the docs described `input` cells long after the server switched to
 * `widget` cells.
 */

const read = (path: string) => readFileSync(path, 'utf8')
const jsonSchema = JSON.parse(read('docs/schemas/notebook.v1.schema.json'))

const DOCS_WITH_EXAMPLES = ['docs/notebook-import-api-v1.md', 'docs/notebook-llm-prompt-template.md']

/** Every ```json block in a markdown file that holds a notebook, bare or under `notebook`. */
function notebookExamples(path: string) {
  const blocks = [...read(path).matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1])
  const out: Array<{ label: string; notebook: Record<string, unknown> }> = []
  blocks.forEach((block, index) => {
    const parsed = JSON.parse(block) as Record<string, unknown>
    const notebook = (parsed.notebook ?? parsed) as Record<string, unknown>
    if (notebook.spec_version && Array.isArray(notebook.cells) && notebook.cells.length > 0) {
      out.push({ label: `${path} json block #${index + 1}`, notebook })
    }
  })
  return out
}

describe('notebook spec docs', () => {
  it('JSON schema lists the cell types the server accepts', () => {
    const serverTypes = notebookSpecV1Schema.shape.cells.element.shape.type.options
    expect([...jsonSchema.definitions.cell.properties.type.enum].sort()).toEqual([...serverTypes].sort())
  })

  it('JSON schema lists the widget types the server accepts', () => {
    expect([...jsonSchema.definitions.widgetMetadata.properties.widgetType.enum].sort()).toEqual(
      [...notebookWidgetTypeSchema.options].sort()
    )
  })

  it.each(DOCS_WITH_EXAMPLES)('every notebook example in %s is valid', (path) => {
    const examples = notebookExamples(path)
    expect(examples.length).toBeGreaterThan(0)
    for (const { label, notebook } of examples) {
      const result = notebookSpecV1Schema.safeParse(notebook)
      expect(result.success, `${label}: ${result.error?.message}`).toBe(true)
    }
  })

  it('the demo notebook is valid', () => {
    const notebook = JSON.parse(read('docs/demo/store-revenue.notebook.json'))
    expect(notebookSpecV1Schema.safeParse(notebook).success).toBe(true)
  })

  it('rejects the legacy input cell type', () => {
    const result = notebookSpecV1Schema.safeParse({
      spec_version: '1.0',
      title: 'Legacy',
      cells: [{ id: 'a', type: 'input', content: '', metadata: { key: 'k', label: 'K', inputType: 'date' } }],
    })
    expect(result.success).toBe(false)
  })
})
