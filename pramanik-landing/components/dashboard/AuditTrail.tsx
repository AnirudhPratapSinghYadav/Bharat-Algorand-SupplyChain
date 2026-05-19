'use client';

import { useEffect, useState } from 'react';
import { getAuditTrail } from '@/lib/api';
import { AuditEntry } from '@/lib/types';
import { Loader2 } from 'lucide-react';

export default function AuditTrail({ shipmentId }: { shipmentId: string }) {
  const [trail, setTrail] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAudit = async () => {
      try {
        const data = await getAuditTrail(shipmentId);
        setTrail(data);
      } catch (err) {
        console.error('Failed to load audit trail:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAudit();
  }, [shipmentId]);

  if (loading) {
    return (
      <div className="mt-8 flex justify-center text-[#9AA5B4]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (trail.length === 0) return null;

  return (
    <div className="mt-8 font-mono text-[12px] bg-[#161A20] border border-[#2A2F36] rounded-[10px] p-6 overflow-x-auto">
      <p className="text-[#F5F5F2] mb-4 uppercase tracking-wider">AUDIT TRAIL</p>
      
      <table className="w-full text-left whitespace-nowrap min-w-[500px]">
        <thead>
          <tr className="border-b border-[#2A2F36] text-[#9AA5B4]">
            <th className="py-2 pr-4">TIMESTAMP</th>
            <th className="py-2 pr-4">EVENT</th>
            <th className="py-2">STATUS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E2329]/50">
          {trail.map((entry, idx) => {
            // Format timestamp nicely
            let formattedTime = entry.timestamp;
            try {
              const d = new Date(entry.timestamp);
              formattedTime = d.toISOString().replace('T', ' ').substring(0, 16);
            } catch (e) {}

            return (
              <tr key={idx} className="text-[#F5F5F2]">
                <td className="py-2 pr-4 text-[#9AA5B4]">{formattedTime}</td>
                <td className="py-2 pr-4">{entry.event}</td>
                <td className="py-2">
                  <span className={entry.on_chain ? 'text-[#22C55E]' : 'text-[#4A5568]'}>
                    {entry.on_chain ? 'On-chain' : 'Off-chain'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
