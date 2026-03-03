import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        sage: {
          50: "#f4f7f5",
          100: "#e8efe9",
          200: "#ceded2",
          300: "#a7c1b0",
          400: "#7d9e8b",
          500: "#607f6f",
          600: "#4d685b",
          700: "#3f5349",
          800: "#34443c",
          900: "#2d3932"
        }
      }
    }
  },
  plugins: []
};

export default config;
