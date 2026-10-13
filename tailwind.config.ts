import type { Config } from 'tailwindcss'
export default { content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'], theme: { extend: { colors: { ink: '#10100f', gold: '#c8a96b' }, fontFamily: { sans: ['DM Sans', 'sans-serif'], display: ['Playfair Display', 'serif'] } } }, plugins: [] } satisfies Config
