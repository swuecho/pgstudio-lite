// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExecutedQueryPanel } from '../components/notebook/ExecutedQueryPanel'

describe('ExecutedQueryPanel', () => {
  it('shows the compiled SQL, bound values, warnings and an inlined rendering', () => {
    render(
      <ExecutedQueryPanel
        info={{
          text: 'select * from distribution_stores where organization_id = $1',
          values: [''],
          params: [
            {
              key: 'param_2r98h1',
              placeholder: '$1',
              value: '',
              valueType: 'string',
              source: 'widget',
              warning: 'Value is an empty string.',
            },
          ],
        }}
      />
    )

    expect(screen.getByText('Executed query')).toBeInTheDocument()
    expect(screen.getByText('1 param')).toBeInTheDocument()
    expect(screen.getByText('1 warning')).toBeInTheDocument()
    expect(
      screen.getByText('select * from distribution_stores where organization_id = $1')
    ).toBeInTheDocument()
    expect(
      screen.getByText("select * from distribution_stores where organization_id = ''")
    ).toBeInTheDocument()
    expect(screen.getAllByText('{{param_2r98h1}}').length).toBeGreaterThan(0)
    expect(screen.getByText('widget cell')).toBeInTheDocument()
    expect(screen.getByText('Value is an empty string.')).toBeInTheDocument()
  })
})
