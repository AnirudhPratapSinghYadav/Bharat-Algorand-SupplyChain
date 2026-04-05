type LandingFooterProps = {
  appId: number | null;
};

export function LandingFooter({ appId }: LandingFooterProps) {
  const year = new Date().getFullYear();
  const id = appId && appId > 0 ? appId : null;
  return (
    <footer className="nt-footer nt-footer--minimal">
      <div className="nt-footer-links">
        <a href="https://www.algorand.com/" target="_blank" rel="noreferrer">
          Algorand
        </a>
        {id ? (
          <>
            <span className="nt-footer-sep" aria-hidden>
              ·
            </span>
            <span className="nt-footer-app">App #{id}</span>
          </>
        ) : null}
      </div>
      <div>
        © {year} Navi-Trust · Built on Algorand
      </div>
    </footer>
  );
}
