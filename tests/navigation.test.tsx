// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppLink, parseSearchRecord, stringifySearchRecord, toHref } from '@/components/shared/navigation'

describe('search params', () => {
  it('keep values as strings, so ids and pks are never coerced to numbers', () => {
    expect(parseSearchRecord('?pk=123&table=public.orders&depth=3')).toEqual({
      pk: '123',
      table: 'public.orders',
      depth: '3',
    })
  })

  it('turn repeated keys into arrays and back', () => {
    const parsed = parseSearchRecord('a=1&a=2&b=x')
    expect(parsed).toEqual({ a: ['1', '2'], b: 'x' })
    expect(stringifySearchRecord(parsed)).toBe('?a=1&a=2&b=x')
  })

  it('drop null and undefined and emit nothing for an empty record', () => {
    expect(stringifySearchRecord({ a: undefined, b: null })).toBe('')
    expect(stringifySearchRecord({ q: 'select 1', n: 2 })).toBe('?q=select+1&n=2')
  })

  it('build hrefs from strings or pathname + query', () => {
    expect(toHref('/activity')).toBe('/activity')
    expect(toHref({ pathname: '/table-editor', query: { schema: 'app', table: 'users' } })).toBe(
      '/table-editor?schema=app&table=users'
    )
  })
})

describe('AppLink', () => {
  it('renders a real anchor and leaves the click alone when no router is mounted', () => {
    render(<AppLink href={{ pathname: '/trace', query: { table: 't' } }}>Trace</AppLink>)
    const link = screen.getByRole('link', { name: 'Trace' })
    expect(link).toHaveAttribute('href', '/trace?table=t')

    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    fireEvent(link, click)
    expect(click.defaultPrevented).toBe(false)
  })
})
