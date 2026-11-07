import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f1c17",
        moss: "#1f4d3a",
        leaf: "#2f6b4f",
        mint: "#d8efe4",
        sand: "#f3f0e8",
        clay: "#c45c26",
        fog: "#e8ece9",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 12px 40px rgba(15, 28, 23, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
