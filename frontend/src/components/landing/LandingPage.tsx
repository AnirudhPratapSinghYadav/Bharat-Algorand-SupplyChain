import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './landing.css';
import { BACKEND_URL } from '../../constants/api';
import { useLandingHorizontalScroll } from './useLandingHorizontalScroll';
import { HeroSection } from './HeroSection';
import { GeopoliticalStakesSection } from './GeopoliticalStakesSection';
import { ProblemSection } from './ProblemSection';
import { SolutionSection } from './SolutionSection';
import { StepsSection } from './StepsSection';
import { QuickProofSection } from './QuickProofSection';
import { DemoStory } from '../DemoStory';
import { CTASection } from './CTASection';
import { LandingFooter } from './LandingFooter';

export type LandingPageProps = {
  onConnectWallet: () => void;
};

export function LandingPage({ onConnectWallet }: LandingPageProps) {
  const landingRootRef = useRef<HTMLDivElement>(null);
  const [landingAppId, setLandingAppId] = useState<number | null>(null);
  useLandingHorizontalScroll(landingRootRef);

  useEffect(() => {
    axios
      .get<{ app_id?: number }>(`${BACKEND_URL}/config`, { timeout: 6000 })
      .then((r) => {
        const id = r.data?.app_id;
        setLandingAppId(typeof id === 'number' && id > 0 ? id : null);
      })
      .catch(() => setLandingAppId(null));
  }, []);

  return (
    <div ref={landingRootRef} className="nt-landing">
      <div className="nt-bg-glow" aria-hidden />
      <header className="nt-nav-shell">
        <div className="nt-nav">
          <Link to="/" className="nt-nav-brand">
            <span className="nt-nav-logo" aria-hidden>
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="nt-nav-logo-svg">
                <rect x="4" y="10" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <rect x="18" y="6" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.95" />
                <rect x="18" y="18" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
                <path d="M14 15h4M22 16v4M18 20h-2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.55" />
              </svg>
            </span>
            <span className="nt-nav-brand-text">Navi-Trust</span>
          </Link>
          <div className="nt-nav-actions">
            <button type="button" className="nt-btn nt-btn--primary nt-nav-wallet" onClick={onConnectWallet}>
              Connect wallet
            </button>
          </div>
        </div>
      </header>

      <main>
        <HeroSection />
        <GeopoliticalStakesSection />
        <ProblemSection />
        <SolutionSection />
        <StepsSection />
        <QuickProofSection />
        <DemoStory />
        <div className="section-divider" aria-hidden />
        <CTASection onCreateShipment={onConnectWallet} />
      </main>

      <LandingFooter appId={landingAppId} />
    </div>
  );
}
