# Notebook Import Contract (v1)

## Goal

Use `pgstudio-lite` as a presentation and execution layer, while external coding agents (Codex/Claude Code) generate full notebooks and write them into pgstudio through a stable API.

This document defines:

- canonical notebook JSON contract (`spec_version = "1.0"`)
- import/export/patch API contracts
- validation and error response format

## Scope

### In scope (v1)

- notebook metadata: `title`, `description`, `connection_name`
- ordered cells for `markdown`, `input`, and `sql`
- widget metadata for input cells
- full notebook import
- full notebook export
- partial updates through JSON Patch

### Out of scope (v1)

- LLM generation endpoint inside pgstudio
- chart/table visualization cell types (can be added in v1.1+)
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
  "cells": []
}
```

### Field rules

- `spec_version`: required, must be `"1.0"`.
- `id`: optional on import; when present, server may ignore unless `upsert` mode is used.
- `title`: required, non-empty string.
- `description`: optional string, max 10k chars recommended.
- `connection_name`: optional string; if omitted, server default connection is used.
- `metadata`: optional object for non-rendering metadata (owner, tags, source tool, etc).
- `cells`: required array, min length `1`.

### Cell object

```json
{
  "id": "stable-cell-id",
  "type": "markdown | input | sql",
  "position": 0,
  "collapsed": false,
  "content": "cell content",
  "metadata": {}
}
```

- `id`: required stable identifier string (agent-generated).
- `type`: required enum: `markdown`, `input`, `sql`.
- `position`: optional integer >= 0. If missing, server derives order from array index.
- `collapsed`: optional boolean, default `false`.
- `content`: required string for all cell types.
- `metadata`: required for `input`, optional otherwise.

### Input cell metadata

`type = "input"` requires:

```json
{
  "key": "start_date",
  "label": "Start Date",
  "inputType": "date",
  "value": "2026-01-01",
  "required": true,
  "placeholder": "",
  "options": [],
  "min": 0,
  "max": 100,
  "step": 1,
  "autoRun": true
}
```

Field compatibility follows existing app behavior:

- `inputType`: `text | number | date | datetime-local | checkbox | select | range | multiselect`
- `key` must match: `^[A-Za-z_][A-Za-z0-9_]*$`
- `value` type depends on `inputType`
- `options` used by `select` and `multiselect`

### SQL parameter convention

SQL cells should reference input keys using:

```sql
select * from events where event_date >= {{start_date}};
```

`{{key}}` placeholders are resolved by current notebook execution logic.

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
        "id": "input_start_date",
        "type": "input",
        "content": "",
        "metadata": {
          "key": "start_date",
          "label": "Start date",
          "inputType": "date",
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
- `target_notebook_id`: required when `mode = replace`; optional when `mode = upsert`
- `notebook`: canonical notebook JSON
- `validate_only`: optional boolean; if true, do not persist

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
- normalizes cell order and input metadata
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

Request (RFC 6902 JSON Patch):

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

All validation failures should return `422`:

```json
{
  "error": "validation_failed",
  "details": [
    {
      "code": "invalid_type",
      "path": "/cells/2/metadata/key",
      "message": "Expected key to match ^[A-Za-z_][A-Za-z0-9_]*$"
    }
  ]
}
```

Other standard errors:

- `400`: malformed payload / unsupported `spec_version`
- `404`: notebook not found
- `409`: replace/upsert conflict
- `500`: unexpected server error

## Guardrails

- Import does not execute SQL.
- SQL remains subject to existing execution/read-only policies at run time.
- Server sanitizes/normalizes dangerous or malformed metadata fields.
- Server enforces maximum payload size and cell count limits.

## Versioning

- `spec_version` is required in import/patch payloads.
- Backward-incompatible changes require new version (`2.0`).
- `/export` always returns the canonical latest format for that notebook version.

## Implementation Notes (mapping to current code)

- Existing notebook endpoints remain unchanged:
  - `GET|POST|PATCH|DELETE /api/notebooks`
  - `GET /api/notebooks/:id`
  - `POST|PATCH|DELETE /api/notebooks/:id/cells`
- New endpoints to add:
  - `POST /api/notebooks/import`
  - `GET /api/notebooks/:id/export`
  - `POST /api/notebooks/:id/patch`
- Internally, import can compose existing notebook and cell write functions, but should run in one transaction and return canonical output.

## JSON Schema Reference

Canonical schema draft for validators is in:

- `docs/schemas/notebook.v1.schema.json`

LLM authoring prompt template is in:

- `docs/notebook-llm-prompt-template.md`
