import Document, { Head, Html, Main, NextScript } from 'next/document'

export default class PgStudioDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          {/*
            Runs before first paint so the saved (or OS) theme is already on
            <html> when the page renders. Applying it from an effect in _app
            meant dark-theme users saw a white flash on every load.

            External rather than inlined: the desktop build serves the renderer
            under a CSP without `script-src 'unsafe-inline'`. Generated from
            themeBootstrapScript() by scripts/generate-theme-bootstrap.mjs.
          */}
          <script src="/theme-bootstrap.js" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <meta name="color-scheme" content="light dark" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
