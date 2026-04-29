import type { Config } from 'tailwindcss';

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
    },
  },
  plugins: [],
} satisfies Config;
