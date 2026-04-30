import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        peaty: {
          cream: '#fef7e7',
          green: '#7fb069',
          gold: '#f4c430',
        },
      },
      keyframes: {
        'flip-in': {
          '0%': { transform: 'rotateY(180deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg)', opacity: '1' },
        },
      },
      animation: {
        'flip-in': 'flip-in 250ms ease-out',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
