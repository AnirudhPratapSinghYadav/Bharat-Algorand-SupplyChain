'use client';

import { useEffect, useState } from 'react';
import { runJury, getVerdict } from '@/lib/api';
import { AgentStatus, VerdictResult } from '@/lib/types';
import { Loader2, Check, XCircle } from 'lucide-react';

interface AgentProgressProps {
  shipmentId: string;
  onComplete: (verdict: VerdictResult) => void;
  onError: (error: string) => void;
}

interface AgentState {
  name: string;
  status: AgentStatus;
  logs: string[];
}

export default function AgentProgress({ shipmentId, onComplete, onError }: AgentProgressProps) {
  const [agents, setAgents] = useState<AgentState[]>([
    {
      name: 'WEATHER SENTINEL',
      status: 'PENDING',
      logs: ['→ Querying Stormglass historical maritime data'],
    },
    {
      name: 'COMPLIANCE AUDITOR',
      status: 'PENDING',
      logs: ['→ Querying ICEGATE for Shipping Bill', '→ Querying MarineTraffic AIS for vessel track'],
    },
    {
      name: 'FRAUD DETECTOR',
      status: 'PENDING',
      logs: ['→ Verifying GSTIN via GST API', '→ Cross-checking MCA21', '→ Verifying IEC via DGFT'],
    },
    {
      name: 'CHIEF ARBITER',
      status: 'PENDING',
      logs: ['→ Synthesizing evidence', '→ Applying Incoterm rules', '→ Generating verdict'],
    },
  ]);

  useEffect(() => {
    let isMounted = true;
    
    const executeJury = async () => {
      try {
        // Trigger the backend API to run the jury
        // Since backend might process everything sequentially and block,
        // we simulate the UI progress for visual effect before showing the real result.
        // In a fully streaming setup, this would listen to WebSockets.
        
        // Simulating Agent 1
        if (!isMounted) return;
        updateAgent(0, 'RUNNING');
        await new Promise(r => setTimeout(r, 1200));
        updateAgent(0, 'COMPLETE');
        
        // Simulating Agent 2
        if (!isMounted) return;
        updateAgent(1, 'RUNNING');
        await new Promise(r => setTimeout(r, 1500));
        updateAgent(1, 'COMPLETE');
        
        // Actual API call happens in parallel with the simulation
        const apiCall = runJury(shipmentId);
        
        // Simulating Agent 3
        if (!isMounted) return;
        updateAgent(2, 'RUNNING');
        await new Promise(r => setTimeout(r, 1000));
        updateAgent(2, 'COMPLETE');
        
        // Simulating Agent 4
        if (!isMounted) return;
        updateAgent(3, 'RUNNING');
        
        // Wait for actual API to finish
        await apiCall;
        
        if (!isMounted) return;
        updateAgent(3, 'COMPLETE');
        
        // Fetch the generated verdict
        const result = await getVerdict(shipmentId);
        onComplete(result);
        
      } catch (err: any) {
        if (!isMounted) return;
        // Find first running agent and mark as failed
        setAgents(current => {
          const newAgents = [...current];
          const runningIdx = newAgents.findIndex(a => a.status === 'RUNNING');
          if (runningIdx !== -1) {
            newAgents[runningIdx].status = 'FAILED';
          }
          return newAgents;
        });
        onError(err.message || 'Jury execution failed');
      }
    };

    executeJury();

    return () => {
      isMounted = false;
    };
  }, [shipmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateAgent = (index: number, status: AgentStatus) => {
    setAgents(current => {
      const newAgents = [...current];
      newAgents[index].status = status;
      return newAgents;
    });
  };

  return (
    <div className="bg-[#161A20] border border-[#2A2F36] rounded-[10px] p-6 font-mono text-[13px]">
      <div className="border-b border-[#2A2F36] pb-4 mb-4">
        <h3 className="text-[#F5F5F2] uppercase tracking-wider">
          AI JURY — <span className="text-[#3A6FF7]">{shipmentId}</span>
        </h3>
      </div>
      
      <div className="space-y-6">
        {agents.map((agent, i) => (
          <div key={i} className={`transition-opacity duration-500 ${agent.status === 'PENDING' ? 'opacity-30' : 'opacity-100'}`}>
            <div className="flex items-center text-[#F5F5F2] font-bold mb-2">
              <span className="mr-2">[{i + 1}]</span>
              <span>{agent.name}</span>
            </div>
            
            <div className="pl-8 space-y-1">
              {agent.status === 'RUNNING' && (
                <div className="flex items-center text-[#EAB308]">
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  <span>Running...</span>
                </div>
              )}
              
              {agent.logs.map((log, j) => (
                <div key={j} className="text-[#9AA5B4]">{log}</div>
              ))}
              
              {agent.status === 'COMPLETE' && (
                <div className="flex items-center text-[#22C55E] mt-2">
                  <Check className="w-3 h-3 mr-2" />
                  <span>Complete</span>
                </div>
              )}
              
              {agent.status === 'FAILED' && (
                <div className="flex items-center text-[#EF4444] mt-2">
                  <XCircle className="w-3 h-3 mr-2" />
                  <span>Failed</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
