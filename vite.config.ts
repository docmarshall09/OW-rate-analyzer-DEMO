import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),

    // Vite 5 adds `crossorigin` to <link rel="stylesheet"> tags because CSS is
    // part of the module graph. This attribute triggers CORS mode for the fetch,
    // which breaks on Render (and other CDNs) when the CDN edge node serves
    // assets from a different subdomain and doesn't echo Access-Control-Allow-Origin.
    // Scripts KEEP crossorigin (required for module semantics). CSS does not need it.
    {
      name: 'strip-crossorigin-from-stylesheets',
      transformIndexHtml(html: string) {
        return html.replace(
          /<link rel="stylesheet" crossorigin/g,
          '<link rel="stylesheet"'
        )
      },
    },
  ],

  worker: { format: 'es' },

  build: {
    // Explicitly false: do not add crossorigin to dynamically-loaded assets.
    // The plugin above handles the statically-injected stylesheet link.
    crossOriginLoading: false,
  },

  // Vitest config (cast to any because `test` is not in core Vite types)
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
  },
} as any)
