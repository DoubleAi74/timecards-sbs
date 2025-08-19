/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "custom-bg": "#0f172a",
        "custom-panel": "#111827ee",
        "custom-muted": "#94a3b8",
        "custom-text": "#e5e7eb",
        "custom-accent": "#22c55e",
        "custom-accent-2": "#60a5fa",
        "custom-warn": "#f59e0b",
      },
      fontFamily: {
        myont: ["var(--font-spongebob)"],
      },
    },
  },
  plugins: [],
};
