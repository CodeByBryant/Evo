import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

const DETERMINISM_HINT = 'Use the seeded RandomSource and the simulation clock instead.'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'legacy/**', '.claude/**', '.dev/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // The simulation engine must stay headless and deterministic (ADR 0001).
    files: ['packages/simulation/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: ['react', 'react-dom', 'vite', 'electron', 'pixi.js'].map((name) => ({
            name,
            message: `The simulation engine must not import "${name}".`
          })),
          patterns: [
            {
              group: ['react/*', 'react-dom/*', 'vite/*', '@vitejs/*', 'electron/*', '@electron/*'],
              message: 'The simulation engine must not import UI, bundler, or desktop packages.'
            }
          ]
        }
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'localStorage',
          'sessionStorage',
          'indexedDB',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'HTMLCanvasElement',
          'CanvasRenderingContext2D',
          'OffscreenCanvas'
        ].map((name) => ({
          name,
          message: 'The simulation engine must not use browser APIs.'
        }))
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: DETERMINISM_HINT },
        { object: 'Date', property: 'now', message: DETERMINISM_HINT },
        { object: 'performance', property: 'now', message: DETERMINISM_HINT }
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: `Wall-clock time is not allowed in simulation code. ${DETERMINISM_HINT}`
        }
      ]
    }
  }
)
