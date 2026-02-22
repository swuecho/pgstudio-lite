type NotebookHelpPanelProps = {
  promptTask: string
  setPromptTask: (value: string) => void
  promptDbContext: string
  setPromptDbContext: (value: string) => void
  promptStyle: string
  setPromptStyle: (value: string) => void
  promptPatchTask: string
  setPromptPatchTask: (value: string) => void
  copyGeneratePrompt: () => void
  copyPatchPromptPrefilled: () => void
  copyHelpApiSnippet: (kind: 'curl-import' | 'curl-export' | 'curl-patch' | 'fetch-import') => void
}

export function NotebookHelpPanel(props: NotebookHelpPanelProps) {
  return (
    <section className="notebook-help-panel">
      <h3>Notebook Import/Export Help</h3>
      <p>Use this page as a presentation layer. Generate notebook JSON with Codex/Claude, then import it.</p>
      <p>
        Required import format: <code>spec_version</code>, <code>title</code>, <code>description</code>,{' '}
        <code>connection_name</code>, <code>metadata</code>, <code>cells</code>.
      </p>
      <p>
        Cell types: <code>markdown</code>, <code>input</code>, <code>sql</code>. Use SQL params like{' '}
        <code>{'{{start_date}}'}</code> and define matching <code>input</code> metadata keys.
      </p>
      <p>
        Use prompt template: <code>docs/notebook-llm-prompt-template.md</code>.
      </p>
      <div className="notebook-help-grid">
        <label className="notebook-help-field">
          <span>Task</span>
          <textarea
            value={props.promptTask}
            onChange={(event) => props.setPromptTask(event.target.value)}
            placeholder="Describe the notebook goal"
          />
        </label>
        <label className="notebook-help-field">
          <span>DB Context</span>
          <textarea
            value={props.promptDbContext}
            onChange={(event) => props.setPromptDbContext(event.target.value)}
            placeholder="Tables, columns, relationships"
          />
        </label>
        <label className="notebook-help-field">
          <span>Style</span>
          <textarea
            value={props.promptStyle}
            onChange={(event) => props.setPromptStyle(event.target.value)}
            placeholder="Narrative/format preference"
          />
        </label>
        <label className="notebook-help-field">
          <span>Patch Request</span>
          <textarea
            value={props.promptPatchTask}
            onChange={(event) => props.setPromptPatchTask(event.target.value)}
            placeholder="Describe the notebook changes for patch mode"
          />
        </label>
      </div>
      <div className="notebook-help-actions">
        <button className="btn small notebook-help-copy-btn" onClick={props.copyGeneratePrompt}>
          Generate New Notebook Prompt
        </button>
        <button className="btn small notebook-help-copy-btn" onClick={props.copyPatchPromptPrefilled}>
          Copy Patch Prompt (Prefilled)
        </button>
        <button className="btn small notebook-help-copy-btn" onClick={() => props.copyHelpApiSnippet('curl-import')}>
          Copy import cURL
        </button>
        <button className="btn small notebook-help-copy-btn" onClick={() => props.copyHelpApiSnippet('curl-export')}>
          Copy export cURL
        </button>
        <button className="btn small notebook-help-copy-btn" onClick={() => props.copyHelpApiSnippet('curl-patch')}>
          Copy patch cURL
        </button>
        <button className="btn small notebook-help-copy-btn" onClick={() => props.copyHelpApiSnippet('fetch-import')}>
          Copy import fetch
        </button>
      </div>
      <p>
        API endpoints: <code>POST /api/notebooks/import</code>, <code>GET /api/notebooks/:id/export</code>,{' '}
        <code>POST /api/notebooks/:id/patch</code>.
      </p>
    </section>
  )
}
