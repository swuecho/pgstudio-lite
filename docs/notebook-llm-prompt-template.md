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
- Allowed cell types: `markdown`, `input`, `sql`.
- Every cell must have stable `id`, `type`, and `content`.
- `input` cells must include `metadata` with:
  - `key` matching `^[A-Za-z_][A-Za-z0-9_]*$`
  - `label`, `inputType`, `value`
- SQL cells should use template params in `{{param_key}}` form when input cells exist.
- SQL content must not be empty.
- Keep cell IDs deterministic and readable (e.g., `md_intro`, `input_start_date`, `sql_main_query`).
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
- Allowed cell types: `markdown`, `input`, `sql`.
- Every cell must have stable `id`, `type`, and `content`.
- `input` cells must include `metadata` with:
  - `key` matching `^[A-Za-z_][A-Za-z0-9_]*$`
  - `label`, `inputType`, `value`
- SQL cells should use template params in `{{param_key}}` form when input cells exist.
- SQL content must not be empty.
- Keep cell IDs deterministic and readable (e.g., `md_intro`, `input_start_date`, `sql_main_query`).
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
      "id": "sql_monthly_revenue",
      "type": "sql",
      "content": "select date_trunc('month', created_at) as month, sum(amount) as revenue\nfrom orders\nwhere created_at >= {{start_date}}\ngroup by 1\norder by 1;"
    }
  ]
}
```

## Import Command (API)

After generating JSON, send to:

- `POST /api/notebooks/import`

Body:

```json
{
  "mode": "create",
  "notebook": { "...generated notebook JSON..." }
}
```
