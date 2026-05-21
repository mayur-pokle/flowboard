import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f8f9fb",
          100: "#eef0f4",
          200: "#dde1e9",
          300: "#c2c8d4",
          400: "#9aa2b3",
          500: "#6b7385",
          600: "#4a5163",
          700: "#343a4a",
          800: "#21242f",
          900: "#13151c"
        },
        brand: {
          50: "#eef4ff",
          100: "#dbe7ff",
          200: "#b8cfff",
          300: "#8aaeff",
          400: "#5d8bff",
          500: "#3a6bff",
          600: "#2451f0",
          700: "#1c3fc2",
          800: "#1c389a",
          900: "#1d3479"
        }
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ]
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,17,26,0.04), 0 1px 1px rgba(15,17,26,0.03)",
        cardHover: "0 4px 12px rgba(15,17,26,0.08), 0 1px 2px rgba(15,17,26,0.04)",
        panel: "-12px 0 24px -12px rgba(15,17,26,0.12)"
      }
    }
  },
  plugins: []
};

export default config;
