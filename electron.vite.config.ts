import react from '@vitejs/plugin-react';
import { bytecodePlugin, defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';
import sri from 'vite-plugin-sri';
import string from 'vite-plugin-string';
import svgr from 'vite-plugin-svgr';
import { compression } from 'vite-plugin-compression2';
import { VitePWA } from 'vite-plugin-pwa';

const aliasConfig = {
  '@': resolve(__dirname, 'src')
};

export default defineConfig({
  main: {
    envPrefix: 'MONO_ENV_',
    resolve: { alias: aliasConfig },
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          'node-machine-id',
          '@aracna/core',
          '@aracna/fcm',
          'electron-store',
          'electron-updater',
          'electron-log'
        ]
      })
    ]
  },
  preload: {
    envPrefix: 'MONO_ENV_',
    resolve: { alias: aliasConfig },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    envPrefix: 'MONO_ENV_',
    base: '/',
    build: {
      manifest: true,
      minify: 'terser',
      target: 'esnext',
      cssCodeSplit: true,
      cssMinify: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      reportCompressedSize: false,
      assetsInlineLimit: 4096,
      terserOptions: {
        format: {
          comments: false
        },
        compress: {
          // drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.debug', 'console.warn'],
          passes: 5,
          dead_code: true,
          unsafe: true,
          unsafe_arrows: true,
          unsafe_comps: true,
          unsafe_Function: true,
          unsafe_math: true,
          unsafe_methods: true,
          unsafe_proto: true,
          unsafe_regexp: true,
          unsafe_undefined: true,
          toplevel: true,
          module: true,
          hoist_funs: true,
          hoist_vars: true,
          reduce_funcs: true,
          reduce_vars: true,
          sequences: true,
          conditionals: true,
          evaluate: true,
          booleans: true,
          loops: true,
          unused: true,
          if_return: true,
          join_vars: true,
          collapse_vars: true,
          properties: true,
          keep_fargs: false,
          keep_infinity: false,
          keep_classnames: false,
          keep_fnames: false
        },
        mangle: {
          keep_classnames: false,
          keep_fnames: false,
          properties: {
            regex: /^MONO_ENV_/,
            reserved: ['MONO_ENV_']
          },
          toplevel: true,
          module: true,
          safari10: true
        }
      },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          index_offline: resolve(__dirname, 'src/renderer/index_offline.html'),
          notification: resolve(__dirname, 'src/renderer/notification.html'),
          update: resolve(__dirname, 'src/renderer/update.html'),
          '404': resolve(__dirname, 'src/renderer/404.html')
        },
        output: {
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash][extname]',
          manualChunks: {
            // Core React chunks
            'react-core': ['react', 'react-dom'],
            'react-router': ['react-router-dom'],

            // UI Component chunks - Split into smaller chunks
            'radix-primitives': [
              '@radix-ui/react-slot',
              '@radix-ui/react-label',
              '@radix-ui/react-dialog',
              '@radix-ui/react-scroll-area'
            ],
            'radix-navigation': [
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-navigation-menu',
              '@radix-ui/react-menubar',
              '@radix-ui/react-context-menu'
            ],
            'radix-inputs': [
              '@radix-ui/react-checkbox',
              '@radix-ui/react-radio-group',
              '@radix-ui/react-select',
              '@radix-ui/react-switch'
            ],
            'radix-overlays': [
              '@radix-ui/react-popover',
              '@radix-ui/react-hover-card',
              '@radix-ui/react-tooltip',
              '@radix-ui/react-toast'
            ],
            'radix-layout': [
              '@radix-ui/react-accordion',
              '@radix-ui/react-collapsible',
              '@radix-ui/react-separator',
              '@radix-ui/react-tabs'
            ],

            // Animation and UI effects
            'react-spring': ['@react-spring/web'],

            // Form handling - Split into smaller chunks
            'form-core': ['react-hook-form'],
            'form-validation': ['@hookform/resolvers', 'zod'],

            // Date handling - Combine into one chunk
            'date-utils': ['date-fns', 'date-fns-tz', 'dayjs'],

            // Firebase services - Split into smaller chunks
            'firebase-core': ['@firebase/app'],
            'firebase-auth': ['@firebase/auth'],
            'firebase-db': ['@firebase/firestore'],
            'firebase-functions': ['@firebase/functions'],
            'firebase-storage': ['@firebase/storage'],

            // TipTap editor - Combine into one chunk
            tiptap: ['@tiptap/react', '@tiptap/starter-kit'],

            // Utility libraries - Split into smaller chunks
            'utils-core': ['lodash'],
            'utils-id': ['uuid'],
            'utils-state': ['immer', 'jotai'],
            'utils-dom': ['dompurify', 'sanitize-html'],
            'utils-markdown': ['marked', 'remark-gfm', 'rehype-raw'],

            // Analytics and tracking
            analytics: ['@amplitude/analytics-browser', 'mixpanel-browser'],

            // PDF and document handling
            'document-handling': ['react-pdf', 'react-to-print'],

            // Virtualization and performance
            virtualization: ['react-window', 'react-virtualized-auto-sizer'],

            // Internationalization - Split into smaller chunks
            'i18n-core': ['i18next', 'react-i18next'],
            'i18n-utils': ['i18next-browser-languagedetector', 'i18next-http-backend']
          }
        }
      }
    },
    resolve: {
      alias: aliasConfig,
      dedupe: ['react', 'react-dom'],
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    },
    optimizeDeps: {
      include: ['react-scan', '@react-spring/web'],
      exclude: ['electron'],
      esbuildOptions: {
        target: 'esnext',
        supported: {
          'top-level-await': true
        },
        legalComments: 'none',
        treeShaking: true
      }
    },
    plugins: [
      react({
        babel: {
          plugins: [
            ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
            ['@babel/plugin-transform-runtime', { regenerator: true }]
          ]
        }
      }),
      svgr(),
      string(),
      sri({
        algorithms: ['sha384']
      }),
      compression({
        algorithms: ['gzip'],
        exclude: [/\.(br)$/, /\.(gz)$/],
        deleteOriginalAssets: false
      }),
      compression({
        algorithms: ['brotliCompress'],
        exclude: [/\.(br)$/, /\.(gz)$/],
        deleteOriginalAssets: false
      }),
      VitePWA({
        registerType: 'autoUpdate', // Auto-update but without forcing refresh
        devOptions: {
          enabled: false // Disable in dev to avoid 500 errors
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          cleanupOutdatedCaches: true,
          // clientsClaim: true,
          // skipWaiting: false,
          maximumFileSizeToCacheInBytes: 1024 * 1024 * 10, // 10MB

          // Enhanced runtime caching with proper Network First behavior
          runtimeCaching: [
            // Main app routes - Network First with aggressive timeout
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'app-pages-cache',
                networkTimeoutSeconds: 2, // Faster timeout for better Network First behavior
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
                }
              }
            },
            // HTML files - Network First with short timeout
            {
              urlPattern: /\.html$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'html-cache',
                networkTimeoutSeconds: 2,
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 1 // 1 day
                }
              }
            },

            // Static assets (JS/CSS) - Network First with medium timeout
            {
              urlPattern: /\.(?:js|css)$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'static-resources',
                networkTimeoutSeconds: 3, // Allow slightly more time for static assets
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                }
              }
            },

            // Images - StaleWhileRevalidate for better UX (but still network-first intent)
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
                }
              }
            },

            // External fonts - Cache First (these rarely change)
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 365 days
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 365 days
                }
              }
            }
          ]
        },

        // No manifest needed - just service worker for caching
        manifest: false
      })
    ]
  }
});
