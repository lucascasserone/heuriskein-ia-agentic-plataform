module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        // True Dark Mode - Cyberpunk Aesthetic
        dark: '#05070A',
        darker: '#0a0e14',
        surface: '#0f1419',
        'surface-alt': '#1a1f2e',
        
        // Primary - Neon Electric Blue
        primary: '#00F2FF',
        'primary-dark': '#00A8CC',
        'primary-light': '#33FFFF',
        
        // Secondary - Cyan Subtle
        secondary: '#00D9FF',
        'secondary-dark': '#0099CC',
        
        // Accents
        accent: '#FF006E',
        'accent-muted': '#FF1493',
        success: '#00DC82',
        warning: '#FFB81C',
        danger: '#FF0055',
        
        // Grayscale Metallic - IMPROVED FOR CONTRAST
        'gray-metallic': '#2D3748',
        'gray-dim': '#4A5568',          // Min contrast for descriptions
        'gray-light': '#A0AEC0',        // Primary text color
        'gray-lighter': '#CBD5E0',      // Lighter descriptions
        'text-default': '#E2E8F0',      // Default body text
        'text-title': '#FFFFFF',        // Title text (pure white)
      },
      boxShadow: {
        // Glow effects
        'glow-primary': '0 0 20px rgba(0, 242, 255, 0.3)',
        'glow-primary-lg': '0 0 40px rgba(0, 242, 255, 0.4)',
        'glow-neon': '0 0 15px rgba(255, 0, 110, 0.3)',
        // Subtle depth
        'subtle': '0 4px 12px rgba(0, 0, 0, 0.4)',
        'medium': '0 8px 24px rgba(0, 0, 0, 0.5)',
      },
      borderColor: {
        'primary': '#00F2FF',
        'secondary': '#00D9FF',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'led-pulse': 'led-pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-icon': 'glow-icon 2s ease-in-out infinite',
        'blink-focus': 'blink-focus 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 242, 255, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 242, 255, 0.6)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'led-pulse': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 8px rgba(0, 242, 255, 0.8)' },
          '50%': { opacity: '0.6', boxShadow: '0 0 4px rgba(0, 242, 255, 0.4)' },
        },
        'glow-icon': {
          '0%, 100%': { filter: 'drop-shadow(0 0 2px rgba(0, 242, 255, 0.3))' },
          '50%': { filter: 'drop-shadow(0 0 8px rgba(0, 242, 255, 0.8))' },
        },
        'blink-focus': {
          '0%, 100%': { borderColor: 'rgba(0, 242, 255, 0.3)' },
          '50%': { borderColor: 'rgba(0, 242, 255, 0.8)' },
        },
      },
    },
  },
  plugins: [],
};
