/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── "Manuscript at night" — a warm dark theme ──────────────────────
        // Deep espresso grounds, parchment-ink text, a terracotta accent with
        // saffron highlights. Semantic names (not slate/indigo) so the palette
        // reads as one considered system.
        ground: "#181310", // page background (deep espresso)
        surface: "#221a15", // panels, cards, bubbles
        raised: "#2d231b", // chips / raised surfaces
        line: "#3a2d23", // borders
        line2: "#4c3b2d", // stronger borders
        ink: "#f3ebdd", // primary text (parchment)
        muted: "#c8b9a4", // secondary text
        faint: "#93826c", // captions / hints
        accent: {
          DEFAULT: "#d3663c", // terracotta — borders, accent text, button hover
          deep: "#c2410c", // buttons (white text is legible on this)
          bright: "#f2a680", // bright accent / focus ring / highlights
          soft: "#3a2418", // tinted chip background
          softer: "#4c2f1f", // chip hover
        },
        saffron: {
          DEFAULT: "#e0a458", // citation highlight
          soft: "#2f2413",
        },
        ok: { DEFAULT: "#77c99a", soft: "#182a1f", text: "#a6dfbd", border: "#2c4636" },
        danger: { DEFAULT: "#ef8a9c", soft: "#331a1e", text: "#f4abb6", border: "#552932" },
      },
    },
  },
  plugins: [],
};
