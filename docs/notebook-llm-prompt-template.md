# LLM Prompt Template: Generate Notebook JSON (v1)

Use this prompt with Codex, Claude Code, or similar coding tools to generate a full notebook document compatible with pgstudio-lite import.

## Template

```md
You are generating a pgstudio-lite notebook document.

Return only valid JSON. Do not include markdown fences, prose, comments, or explanations.

Requirements:

- Output must follow notebook spec v1.
- Set `"spec_version"` to `"1.0"`.
- Include top-level fields: `spec_version`, `title`, `description`, `connection_name`, `metadata`, `cells`.
- `cells` must be a non-empty array.
- Allowed cell types: `markdown`, `sql`, `widget`.
- Every cell must have stable `id`, `type`, and `content` (use `""` for widget cells).
- `widget` cells must include `metadata` with a `widgetType`:
  - Parameter widgets (`text`, `number`, `date`, `datetime-local`, `checkbox`, `select`, `range`, `multiselect`, `radio-group`) need `key` matching `^[A-Za-z_][A-Za-z0-9_]*$`, a `label`, and a `value`.
  - `select`, `multiselect` and `radio-group` also need `options`: `[{ "label": "...", "value": "..." }]`.
  - `date-range` needs `config.startKey` and `config.endKey`, and a `value` of `{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }`.
  - Set `autoRun: true` so dependent SQL re-runs when the value changes.
- SQL cells use widget values as `{{key}}`. They are bound as query parameters, so use them only where a value is allowed, and compare `multiselect` values with `= any({{key}})`.
- SQL content must not be empty.
- Keep cell IDs deterministic and readable (e.g., `md_intro`, `widget_date_range`, `sql_main_query`).
- Put cells in intended execution order.
- Prefer safe, read-only SQL (`SELECT ...`) unless asked otherwise.

Task:
{{TASK_DESCRIPTION}}

Database context (if provided):
{{DB_CONTEXT}}

Notebook style preferences (if provided):
{{STYLE_PREFERENCES}}

Return JSON only.
```

## Example Filled Prompt

```md
You are generating a pgstudio-lite notebook document.

Return only valid JSON. Do not include markdown fences, prose, comments, or explanations.

Requirements:

- Output must follow notebook spec v1.
- Set `"spec_version"` to `"1.0"`.
- Include top-level fields: `spec_version`, `title`, `description`, `connection_name`, `metadata`, `cells`.
- `cells` must be a non-empty array.
- Allowed cell types: `markdown`, `sql`, `widget`.
- Every cell must have stable `id`, `type`, and `content` (use `""` for widget cells).
- `widget` cells must include `metadata` with a `widgetType`:
  - Parameter widgets (`text`, `number`, `date`, `datetime-local`, `checkbox`, `select`, `range`, `multiselect`, `radio-group`) need `key` matching `^[A-Za-z_][A-Za-z0-9_]*$`, a `label`, and a `value`.
  - `select`, `multiselect` and `radio-group` also need `options`: `[{ "label": "...", "value": "..." }]`.
  - `date-range` needs `config.startKey` and `config.endKey`, and a `value` of `{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }`.
  - Set `autoRun: true` so dependent SQL re-runs when the value changes.
- SQL cells use widget values as `{{key}}`. They are bound as query parameters, so use them only where a value is allowed, and compare `multiselect` values with `= any({{key}})`.
- SQL content must not be empty.
- Keep cell IDs deterministic and readable (e.g., `md_intro`, `widget_date_range`, `sql_main_query`).
- Put cells in intended execution order.
- Prefer safe, read-only SQL (`SELECT ...`) unless asked otherwise.

Task:
Create a sales performance notebook with intro markdown, date range inputs, and two SQL analyses:

1. monthly revenue trend
2. top 10 customers by revenue

Database context (if provided):
PostgreSQL tables:

- orders(id, customer_id, created_at, amount, status)
- customers(id, name, segment)

Notebook style preferences (if provided):
Concise business-facing narrative with section headers.

Return JSON only.
```

## Expected Output Shape

```json
{
  "spec_version": "1.0",
  "title": "Sales Performance",
  "description": "Business summary notebook for revenue and top customers.",
  "connection_name": "default",
  "metadata": {
    "source": "codex"
  },
  "cells": [
    {
      "id": "md_intro",
      "type": "markdown",
      "content": "# Sales Performance\nThis notebook summarizes recent sales metrics."
    },
    {
      "id": "widget_date_range",
      "type": "widget",
      "content": "",
      "metadata": {
        "widgetType": "date-range",
        "label": "Order date",
        "config": { "startKey": "start_date", "endKey": "end_date" },
        "value": { "start": "2026-01-01", "end": "2026-06-30" },
        "autoRun": true
      }
    },
    {
      "id": "sql_monthly_revenue",
      "type": "sql",
      "content": "select date_trunc('month', created_at) as month, sum(amount) as revenue\nfrom orders\nwhere created_at >= {{start_date}} and created_at < {{end_date}}::date + 1\ngroup by 1\norder by 1;"
    },
    {
      "id": "sql_top_customers",
      "type": "sql",
      "content": "select c.name, c.segment, sum(o.amount) as revenue\nfrom orders o\njoin customers c on c.id = o.customer_id\nwhere o.created_at >= {{start_date}} and o.created_at < {{end_date}}::date + 1\ngroup by c.name, c.segment\norder by revenue desc\nlimit 10;"
    }
  ]
}
```

## Import

Paste the generated JSON into **Import** on the Notebook page, or send it to the API:

- `POST /api/notebooks/import`

Body: the generated notebook under `notebook`.

```json
{
  "mode": "create",
  "notebook": {
    "spec_version": "1.0",
    "title": "Sales Performance",
    "cells": [{ "id": "sql_main", "type": "sql", "content": "select 1;" }]
  }
}
```

The full contract, including every widget type, is in
[notebook-import-api-v1.md](./notebook-import-api-v1.md).
