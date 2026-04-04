export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="nt-footer nt-footer--minimal">
      <div className="nt-footer-links">
        <a href="https://www.algorand.com/" target="_blank" rel="noreferrer">
          Algorand
        </a>
      </div>
      <div>
        © {year} Navi-Trust · Built on Algorand
      </div>
    </footer>
  );
}
