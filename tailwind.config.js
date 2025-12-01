module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0c0c1d",
        mist: "#0e1726",
        lime: "#b0ff6d",
        teal: "#4fd1c5",
        card: "#111a2b",
        slate: "#1b2435"
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"]
      },
      boxShadow: {
        glow: "0 20px 60px rgba(80, 225, 182, 0.25)"
      },
      borderRadius: {
        xl: "24px"
      }
    }
  },
  plugins: []
};
