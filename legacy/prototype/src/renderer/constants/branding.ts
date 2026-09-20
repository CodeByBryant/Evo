export const BRANDING = {
  APP_NAME: 'Evo',
  APP_TAGLINE: 'Neural Evolution Sandbox',
  APP_DESCRIPTION: 'Watch AI agents learn and evolve in real-time',
  VERSION: '0.1.0'
} as const

export const THEME = {
  colors: {
    background: {
      primary: '#0a0a0a',
      secondary: '#1a1a1a',
      tertiary: '#2a2a2a'
    },
    surface: {
      primary: '#1e1e1e',
      secondary: '#252525',
      elevated: '#2d2d2d'
    },
    text: {
      primary: '#e0e0e0',
      secondary: '#a0a0a0',
      muted: '#707070',
      accent: '#60a5fa'
    },
    border: {
      subtle: '#3a3a3a',
      default: '#4a4a4a',
      emphasis: '#5a5a5a'
    },
    agent: {
      default: '#60a5fa',
      active: '#3b82f6',
      sensor: '#94a3b8'
    },
    food: {
      default: '#fbbf24',
      glow: '#f59e0b'
    },
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444'
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem'
  },
  borderRadius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem'
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.6)'
  }
} as const
