import Head from 'next/head'

const APP_NAME = 'PG Studio Lite'

type PageHeadProps = {
  /** Page name, e.g. "SQL Editor". */
  title: string
  /** Optional context shown first, e.g. the open table or notebook. */
  subject?: string | null
}

/**
 * Gives every route a real browser-tab title. Without one, several open tabs of
 * this app are indistinguishable in the tab strip.
 */
export function PageHead({ title, subject }: PageHeadProps) {
  const trimmedSubject = subject?.trim()
  const documentTitle = trimmedSubject
    ? `${trimmedSubject} · ${title} · ${APP_NAME}`
    : `${title} · ${APP_NAME}`

  return (
    <Head>
      <title>{documentTitle}</title>
    </Head>
  )
}
