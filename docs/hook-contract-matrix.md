# Hook Contract Matrix

## SQL editor hooks

| Hook | Data ownership | Effects ownership | UI state ownership |
| --- | --- | --- | --- |
| `useSqlEditorState` | Aggregates tabs, history, snippets, explorer, connections, result | Connection fallback, query execution lifecycle, delegates autosave/schema/history effects to child hooks | Editor ref, status banner, active nav tab, search text, run state, selection state |
| `useSqlEditorSnippets` | Snippet query cache + mutation outputs | Snippet autosave debounce, snippet cache patch/removal | Rename state (`renamingSnippetId`, `renameDraft`) and snippet command outcomes |

## Table editor hooks

| Hook | Data ownership | Effects ownership | UI state ownership |
| --- | --- | --- | --- |
| `useTableEditorLocalState` | Local persisted controls (`connection`, `table`, `paging`, `sort`, `filter`, `status`) | None | All table editor control state |
| `useTableEditorQueries` | Connections/tables/rows queries, row mutations, derived row/column payloads | Mutation invalidation side effects | None (consumes state setters only for status updates) |
| `useTableEditorEffects` | None (reads query outputs + control state) | Connection fallback, active-table reconciliation, paging reset, sort/filter reconciliation | None |
| `useTableEditorData` | Composition boundary (`queries + effects`) | Delegates to `useTableEditorEffects` | None |

## Split performed

- Overloaded hook split: `useTableEditorData` responsibilities are now split into:
  - `useTableEditorQueries` for network + mutation data flow.
  - `useTableEditorEffects` for synchronization effects.
  - `tableEditorContracts.ts` for deterministic table-selection/sort-filter reconciliation logic.
- Result: lower coupling between data fetch/mutation logic and synchronization effects; edge-case behavior moved into pure functions with tests.
