/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#0F172A",
        accent: { DEFAULT: "#059669", pressed: "#047857" },
        warning: "#D97706",
        surface: "#F8FAFC",
        card: "#FFFFFF",
        danger: "#DC2626",
      },
    },
  },
};
