'use client';

import { useState } from 'react';
import Link from 'next/link';
import { APP_ID } from '@/lib/constants';
import { VerdictResult } from '@/lib/types';
import ShipmentForm from '@/components/dashboard/ShipmentForm';
import AgentProgress from '@/components/dashboard/AgentProgress';
import VerdictCard from '@/components/dashboard/VerdictCard';
import AuditTrail from '@/components/dashboard/AuditTrail';
import { ArrowLeft } from 'lucide-react';

type JuryStatus = 'idle' | 'running' | 'completed' | 'error';

export default function DashboardPage() {
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);
  const [juryStatus, setJuryStatus] = useState<JuryStatus>('idle');
  const [verdictResult, setVerdictResult] = useState<VerdictResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRunJury = (shipmentId: string) => {
    setSelectedShipment(shipmentId);
    setJuryStatus('running');
    setVerdictResult(null);
    setErrorMessage(null);
  };

  const handleJuryComplete = (result: VerdictResult) => {
    setVerdictResult(result);
    setJuryStatus('completed');
  };

  const handleJuryError = (error: string) => {
    setErrorMessage(error);
    setJuryStatus('error');
  };

  return (
    <div className="min-h-screen bg-[#0F1115] text-[#F5F5F2] font-body">
      
      {/* Top Bar */}
      <header className="border-b border-[#2A2F36] bg-[#0A0C0F]">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between font-mono text-[12px]">
          <Link href="/" className="text-[#9AA5B4] hover:text-[#F5F5F2] flex items-center transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> Home
          </Link>
          <div className="text-[#F5F5F2] tracking-widest uppercase">
            PRAMANIK DASHBOARD
          </div>
          <div className="text-[#4A5568] tracking-widest hidden sm:block">
            TESTNET · APP ID: {APP_ID}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Panel */}
          <div className="w-full lg:w-1/2">
            <ShipmentForm onRunJury={handleRunJury} />
          </div>

          {/* Right Panel */}
          <div className="w-full lg:w-1/2 flex flex-col space-y-8">
            {!selectedShipment && (
              <div className="bg-[#161A20] border border-[#2A2F36] rounded-[10px] p-8 h-full flex flex-col items-center justify-center text-center min-h-[400px]">
                <p className="font-mono text-[14px] text-[#4A5568]">Select a shipment to run the jury.</p>
              </div>
            )}

            {selectedShipment && (juryStatus === 'running' || juryStatus === 'error') && (
              <AgentProgress 
                shipmentId={selectedShipment} 
                onComplete={handleJuryComplete} 
                onError={handleJuryError} 
              />
            )}

            {selectedShipment && juryStatus === 'completed' && verdictResult && (
              <>
                <VerdictCard result={verdictResult} />
                <AuditTrail shipmentId={selectedShipment} />
              </>
            )}

            {errorMessage && (
              <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded p-4 text-[#EF4444] font-mono text-[13px]">
                {errorMessage}
              </div>
            )}
          </div>

        </div>
      </main>

    </div>
  );
}
