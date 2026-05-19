import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import ProblemSection from '@/components/landing/ProblemSection';
import SolutionSection from '@/components/landing/SolutionSection';
import SDGSection from '@/components/landing/SDGSection';
import OnChainSection from '@/components/landing/OnChainSection';
import CTASection from '@/components/landing/CTASection';

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <ProblemSection />
      <SolutionSection />
      <SDGSection />
      <OnChainSection />
      <CTASection />
    </main>
  );
}
