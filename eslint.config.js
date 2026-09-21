import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

const DETERMINISM_HINT = 'Use the seeded RandomSource and the simulation clock instead.'
const MATH_HINT = 'use the engine math in math/trig.ts (docs/simulation/determinism.md).'
const ITERATION_HINT =
  'iterate stores in id order or a fixed array (docs/simulation/determinism.md).'

// Transcendental and other implementation-defined Math functions (see determinism.md, section 6).
const PLATFORM_MATH = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'log',
  'log2',
  'log10',
  'log1p',
  'exp',
  'expm1',
  'pow',
  'hypot',
  'cbrt'
]

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
        { object: 'performance', property: 'now', message: DETERMINISM_HINT },
        ...PLATFORM_MATH.map((property) => ({
          object: 'Math',
          property,
          message: `Math.${property} is implementation-defined; ${MATH_HINT}`
        })),
        ...['keys', 'values', 'entries'].map((property) => ({
          object: 'Object',
          property,
          message: `Object.${property} depends on enumeration order; ${ITERATION_HINT}`
        }))
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: `Wall-clock time is not allowed in simulation code. ${DETERMINISM_HINT}`
        },
        {
          selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
          message: `The ** operator is implementation-defined for non-integer exponents; ${MATH_HINT}`
        },
        {
          selector: 'ForInStatement',
          message: `for...in depends on property enumeration order; ${ITERATION_HINT}`
        },
        {
          selector: "CallExpression[callee.property.name='sort'][arguments.length=0]",
          message: 'Array.prototype.sort without a comparator sorts lexicographically; pass one.'
        }
      ]
    }
  }
)
