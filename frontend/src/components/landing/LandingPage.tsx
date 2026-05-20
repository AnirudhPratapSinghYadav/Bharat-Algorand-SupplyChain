import { useEffect, useState } from 'react';
import axios from 'axios';
import './pramanik-landing.css';
import { BACKEND_URL } from '../../constants/api';
import { LandingNavbar } from './original/LandingNavbar';
import { LandingHero } from './original/LandingHero';
import { LandingProblemSection } from './original/LandingProblemSection';
import { LandingSolutionSection } from './original/LandingSolutionSection';
import { LandingSDGSection } from './original/LandingSDGSection';
import { LandingOnChainSection } from './original/LandingOnChainSection';
import { LandingCTASection } from './original/LandingCTASection';

export type LandingPageProps = {
  onConnectWallet: () => void;
};

export function LandingPage({ onConnectWallet }: LandingPageProps) {
  const [landingAppId, setLandingAppId] = useState<number | null>(null);

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
    <div className="pm-landing">
      <LandingNavbar onConnectWallet={onConnectWallet} />
      <main>
        <LandingHero onConnectWallet={onConnectWallet} />
        <LandingProblemSection />
        <LandingSolutionSection onConnectWallet={onConnectWallet} />
        <LandingSDGSection />
        <LandingOnChainSection onConnectWallet={onConnectWallet} appId={landingAppId} />
        <LandingCTASection onConnectWallet={onConnectWallet} appId={landingAppId} />
      </main>
    </div>
  );
}
