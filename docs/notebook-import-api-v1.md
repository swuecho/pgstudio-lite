# Notebook Import Contract (v1)

## Goal

Use `pgstudio-lite` as a presentation and execution layer, while external coding agents (Codex/Claude Code) generate full notebooks and write them into pgstudio through a stable API.

This document defines:

- canonical notebook JSON contract (`spec_version = "1.0"`)
- import/export/patch API contracts
- validation and error response format

The server's Zod schemas are the source of truth: `notebookSpecV1Schema` in
[lib/notebook-spec.ts](../lib/notebook-spec.ts) and `notebookWidgetMetadataSchema` in
[lib/notebook-widgets.ts](../lib/notebook-widgets.ts). The JSON Schema in
[schemas/notebook.v1.schema.json](./schemas/notebook.v1.schema.json) mirrors them for external
validators, and `tests/notebook-spec-docs.test.ts` checks that it, and every notebook example in
this file, still matches the server.

## Scope

### In scope (v1)

- notebook metadata: `title`, `description`, `connection_name`
- ordered cells of type `markdown`, `sql`, and `widget`
- widget metadata: parameter inputs, date ranges, run buttons and callouts
- full notebook import
- full notebook export
- partial updates through JSON Patch

### Out of scope (v1)

- LLM generation endpoint inside pgstudio
- chart/table visualization cell types (chart settings live in the browser, not in the notebook)
- collaborative editing/merge conflict resolution

## Canonical Notebook JSON

### Top-level object

```json
{
  "spec_version": "1.0",
  "id": "optional-notebook-id",
  "title": "Revenue by Segment",
  "description": "Monthly revenue notebook with parameterized SQL",
  "connection_name": "local",
  "metadata": {},
  "cells": [{ "id": "sql_main", "type": "sql", "content": "select 1;" }]
}
```

### Field rules

- `spec_version`: required, must be `"1.0"`.
- `id`: optional. Used by `upsert` to find the notebook to update (see [Import](#1-import-notebook)); in `create` mode an `id` that already exists is a `409`.
- `title`: required, non-empty string.
- `description`: optional string.
- `connection_name`: optional; the name of a saved connection. If omitted, the default connection is used.
- `metadata`: optional object for non-rendering metadata (owner, tags, source tool, etc).
- `cells`: required array, min length `1`.

### Cell object

```json
{
  "id": "stable-cell-id",
  "type": "markdown | sql | widget",
  "position": 0,
  "collapsed": false,
  "content": "cell content",
  "metadata": {}
}
```

- `id`: required stable identifier string (agent-generated).
  Ids must be unique within the notebook. They are also the storage key across all notebooks, so an id already used by a _different_ notebook is replaced with a fresh UUID on import (any `targetCellIds` pointing at it are updated too) and the response lists the swap under `warnings`. Ids already in the target notebook are kept, so `replace`/`upsert`/patch leave unchanged cells, and their stored results, in place.
- `type`: required enum: `markdown`, `sql`, `widget`.
- `position`: optional integer >= 0. If missing, server derives order from array index.
- `collapsed`: optional boolean, default `false`.
- `content`: required string for all cell types. It must not be blank for `sql` cells; use `""` for `widget` cells.
- `metadata`: required for `widget` cells (see below), optional otherwise.

### Widget cell metadata

`type = "widget"` cells carry their settings in `metadata`, discriminated by `widgetType`:

```json
{
  "widgetType": "date",
  "key": "start_date",
  "label": "Start date",
  "value": "2026-01-01",
  "required": true,
  "autoRun": true
}
```

| `widgetType`                     | Binds                           | Required fields                                                                                    | `value` type                   |
| -------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------ |
| `text`, `date`, `datetime-local` | `{{key}}`                       | `key`, `label`                                                                                     | string                         |
| `number`, `range`                | `{{key}}`                       | `key`, `label`                                                                                     | number or `null`               |
| `checkbox`                       | `{{key}}`                       | `key`, `label`                                                                                     | boolean                        |
| `select`                         | `{{key}}`                       | `key`, `label`, and `options` (or `config.optionSource: "sql"` with `config.optionsQuery`)         | string                         |
| `multiselect`                    | `{{key}}` (a text array)        | same as `select`                                                                                   | string array                   |
| `radio-group`                    | `{{key}}`                       | `key`, `label`, `options`                                                                          | string                         |
| `date-range`                     | `{{startKey}}` and `{{endKey}}` | `config.startKey`, `config.endKey` (different valid keys)                                          | `{ "start": "…", "end": "…" }` |
| `actions`                        | nothing; a button               | `config.action`: `"run-all"`, or `"run-targets"` with a non-empty `config.targetCellIds`; no `key` | —                              |
| `callout`                        | nothing; a static note          | a non-empty `config.title` or `config.body`; no `key`                                              | —                              |

Other fields, all optional: `defaultValue` (same type as `value`; used by **Reset**), `helpText`,
`placeholder`, `required`, `hidden`, `disabled`, `autoRun` (re-run dependent SQL cells when the
value changes), `min` / `max` / `step` (for `number` and `range`), and `config`.

- `key` must match `^[A-Za-z_][A-Za-z0-9_]*$`.
- `options` is an array of `{ "label": "…", "value": "…", "description"?: "…" }` with non-empty `label` and `value`.

### SQL parameter convention

SQL cells reference widget values with `{{key}}`:

```sql
select * from events where event_date >= {{start_date}};
```

Placeholders are not pasted into the SQL text. Each distinct key becomes a bound parameter (`$1`,
`$2`, …), so values are safe to use but must be used where a value is allowed: not as a table or
column name. Postgres infers the parameter type from context; add a cast when it can't
(`{{limit}}::int`). A `multiselect` binds a text array, so compare with `= any({{key}})`, not `=`.

## API Contract

## 1) Import notebook

`POST /api/notebooks/import`

Request:

```json
{
  "mode": "create",
  "notebook": {
    "spec_version": "1.0",
    "title": "Revenue by Segment",
    "description": "Monthly report",
    "connection_name": "local",
    "metadata": {
      "source": "codex"
    },
    "cells": [
      {
        "id": "md_intro",
        "type": "markdown",
        "content": "# Revenue Notebook\nThis notebook analyzes monthly revenue."
      },
      {
        "id": "widget_start_date",
        "type": "widget",
        "content": "",
        "metadata": {
          "widgetType": "date",
          "key": "start_date",
          "label": "Start date",
          "value": "2026-01-01",
          "required": true,
          "autoRun": true
        }
      },
      {
        "id": "sql_revenue",
        "type": "sql",
        "content": "select date_trunc('month', created_at) as month, sum(amount) as revenue\nfrom orders\nwhere created_at >= {{start_date}}\ngroup by 1\norder by 1;"
      }
    ]
  }
}
```

Request fields:

- `mode`: `create | replace | upsert` (default `create`)
  - `create`: always makes a new notebook with a new id.
  - `replace`: overwrites the notebook named by `target_notebook_id` (required; `404` if it does not exist).
  - `upsert`: updates the notebook named by `target_notebook_id`, else the one matching `notebook.id`, else creates one (using `notebook.id` if given).
- `target_notebook_id`: required when `mode = replace`; optional when `mode = upsert`
- `notebook`: canonical notebook JSON
- `validate_only`: optional boolean; if true, validate and return the normalized notebook without saving it

Response:

```json
{
  "ok": true,
  "notebook_id": "3cd4edc5-52ce-4efa-a8cf-b4ffcc747f35",
  "warnings": [],
  "notebook": {
    "spec_version": "1.0",
    "title": "Revenue by Segment",
    "description": "Monthly report",
    "connection_name": "local",
    "metadata": {
      "source": "codex"
    },
    "cells": []
  }
}
```

Behavior:

- validates schema and business rules
- normalizes cell order and widget metadata
- persists notebook + cells atomically
- returns canonical persisted representation

## 2) Export notebook

`GET /api/notebooks/:id/export`

Response:

```json
{
  "spec_version": "1.0",
  "id": "3cd4edc5-52ce-4efa-a8cf-b4ffcc747f35",
  "title": "Revenue by Segment",
  "description": "Monthly report",
  "connection_name": "local",
  "metadata": {
    "source": "codex"
  },
  "cells": []
}
```

Behavior:

- returns canonical notebook JSON for round-trip editing
- excludes volatile runtime fields (`last_result_json`, timings, errors)

## 3) Patch notebook

`POST /api/notebooks/:id/patch`

Request (a subset of RFC 6902 JSON Patch: `add`, `remove`, `replace`):

```json
{
  "spec_version": "1.0",
  "ops": [
    {
      "op": "replace",
      "path": "/title",
      "value": "Revenue by Segment (Q1)"
    },
    {
      "op": "add",
      "path": "/cells/1",
      "value": {
        "id": "md_note",
        "type": "markdown",
        "content": "## Notes\nGenerated by Codex."
      }
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "notebook_id": "3cd4edc5-52ce-4efa-a8cf-b4ffcc747f35",
  "warnings": [],
  "notebook": {}
}
```

Behavior:

- applies patch against canonical exported representation
- revalidates full notebook after patch
- persists as one transaction

## Validation and Errors

Validation failures, including a wrong `spec_version`, return `422`:

```json
{
  "error": "validation_failed",
  "details": [
    {
      "code": "custom",
      "path": "/notebook/cells/1/metadata/key",
      "message": "key is required"
    }
  ]
}
```

Other errors:

- `404`: notebook not found (`replace`, export, patch)
- `409`: `create` with a `notebook.id` that already exists
- `500`: unexpected server error

## Guardrails

- Import does not execute SQL.
- SQL remains subject to existing execution/read-only policies at run time.
- Widget metadata is normalized on import; SQL values are always bound as parameters.

## Versioning

- `spec_version` is required in import/patch payloads.
- Backward-incompatible changes require new version (`2.0`).
- `/export` always returns the canonical latest format for that notebook version.

## Related endpoints

- `GET|POST|PATCH|DELETE /api/notebooks`
- `GET /api/notebooks/:id`
- `POST|PATCH|DELETE /api/notebooks/:id/cells`
- `POST /api/notebooks/:id/run-cell`

## JSON Schema Reference

Schema for external validators (draft-07):

- [docs/schemas/notebook.v1.schema.json](./schemas/notebook.v1.schema.json)

LLM authoring prompt template:

- [docs/notebook-llm-prompt-template.md](./notebook-llm-prompt-template.md)
