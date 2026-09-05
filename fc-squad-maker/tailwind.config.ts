import type { Config } from 'tailwindcss';

/**
 * FC 온라인 특유의 "어둡고 대비가 강한" 감성을 토큰으로 고정한다.
 * - pitch: 배경 계열(잔디 밤색 + 뉴트럴)
 * - neon:  강조 계열(FC 온라인 UI의 형광 시안/라임)
 * - grade: 강화 단계별 카드 컬러
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: '#06090f',
          900: '#0a0f18',
          850: '#0e1522',
          800: '#131c2c',
          700: '#1b2739',
          600: '#25344a',
          500: '#33475f',
        },
        neon: {
          cyan: '#22e1ff',
          lime: '#c6ff3d',
          amber: '#ffc542',
          rose: '#ff4d6d',
          violet: '#a78bfa',
        },
        grade: {
          normal: '#9aa7b8',
          bronze: '#c07d4a',
          silver: '#cfd8e3',
          gold: '#f0c14b',
          special: '#22e1ff',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Pretendard', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 12px 32px -12px rgba(0,0,0,0.8)',
        glow: '0 0 0 1px rgba(34,225,255,0.35), 0 0 28px -6px rgba(34,225,255,0.45)',
      },
      keyframes: {
        'pack-shake': {
          '0%, 100%': { transform: 'translateX(0) rotate(0deg)' },
          '20%': { transform: 'translateX(-6px) rotate(-2deg)' },
          '40%': { transform: 'translateX(6px) rotate(2deg)' },
          '60%': { transform: 'translateX(-4px) rotate(-1.5deg)' },
          '80%': { transform: 'translateX(4px) rotate(1.5deg)' },
        },
        'pack-burst': {
          '0%': { opacity: '0', transform: 'scale(0.4)' },
          '55%': { opacity: '1', transform: 'scale(1.12)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'card-reveal': {
          '0%': { opacity: '0', transform: 'translateY(18px) rotateX(35deg)' },
          '100%': { opacity: '1', transform: 'translateY(0) rotateX(0deg)' },
        },
        sheen: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        'pulse-ring': {
          '0%': { opacity: '0.85', transform: 'scale(0.7)' },
          '100%': { opacity: '0', transform: 'scale(1.9)' },
        },
      },
      animation: {
        'pack-shake': 'pack-shake 0.6s ease-in-out infinite',
        'pack-burst': 'pack-burst 0.5s cubic-bezier(0.2, 0.9, 0.25, 1.2) both',
        'card-reveal': 'card-reveal 0.45s ease-out both',
        sheen: 'sheen 1.6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.2s ease-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
