'use client';

import { useState, useEffect } from 'react';
import { registerShipment, getShipments } from '@/lib/api';
import { Shipment } from '@/lib/types';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ShipmentForm({ onRunJury }: { onRunJury: (id: string) => void }) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    shipment_id: '',
    origin: '',
    destination: '',
    escrow_algo: '',
    incoterm: 'FOB',
    departure_date: '',
    vessel_name: '',
    icegate_bill_no: '',
  });

  const loadShipments = async () => {
    try {
      const data = await getShipments();
      setShipments(data);
    } catch (err: any) {
      console.error('Failed to load shipments:', err);
    }
  };

  useEffect(() => {
    loadShipments();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await registerShipment({
        ...formData,
        escrow_algo: parseFloat(formData.escrow_algo),
      });
      setSuccess(true);
      setFormData({
        shipment_id: '',
        origin: '',
        destination: '',
        escrow_algo: '',
        incoterm: 'FOB',
        departure_date: '',
        vessel_name: '',
        icegate_bill_no: '',
      });
      loadShipments();
    } catch (err: any) {
      setError(err.message || 'Failed to register shipment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col space-y-8">
      {/* Registration Form */}
      <div className="bg-[#161A20] border border-[#2A2F36] rounded-[10px] p-6">
        <h3 className="font-mono text-[14px] text-[#F5F5F2] mb-6 uppercase tracking-wider border-b border-[#2A2F36] pb-2">REGISTER SHIPMENT</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-[11px] text-[#9AA5B4] mb-1">Shipment ID *</label>
              <input
                required
                type="text"
                placeholder="e.g. SHIP_SURAT_001"
                className="w-full bg-[#0F1115] border border-[#2A2F36] rounded p-2 text-[14px] text-[#F5F5F2] focus:border-[#3A6FF7] focus:outline-none font-mono"
                value={formData.shipment_id}
                onChange={(e) => setFormData({...formData, shipment_id: e.target.value})}
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] text-[#9AA5B4] mb-1">Escrow (ALGO) *</label>
              <input
                required
                type="number"
                step="0.01"
                placeholder="e.g. 2.5"
                className="w-full bg-[#0F1115] border border-[#2A2F36] rounded p-2 text-[14px] text-[#F5F5F2] focus:border-[#3A6FF7] focus:outline-none font-mono"
                value={formData.escrow_algo}
                onChange={(e) => setFormData({...formData, escrow_algo: e.target.value})}
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] text-[#9AA5B4] mb-1">Origin *</label>
              <input
                required
                type="text"
                className="w-full bg-[#0F1115] border border-[#2A2F36] rounded p-2 text-[14px] text-[#F5F5F2] focus:border-[#3A6FF7] focus:outline-none"
                value={formData.origin}
                onChange={(e) => setFormData({...formData, origin: e.target.value})}
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] text-[#9AA5B4] mb-1">Destination *</label>
              <input
                required
                type="text"
                className="w-full bg-[#0F1115] border border-[#2A2F36] rounded p-2 text-[14px] text-[#F5F5F2] focus:border-[#3A6FF7] focus:outline-none"
                value={formData.destination}
                onChange={(e) => setFormData({...formData, destination: e.target.value})}
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] text-[#9AA5B4] mb-1">Incoterm *</label>
              <select
                className="w-full bg-[#0F1115] border border-[#2A2F36] rounded p-2 text-[14px] text-[#F5F5F2] focus:border-[#3A6FF7] focus:outline-none"
                value={formData.incoterm}
                onChange={(e) => setFormData({...formData, incoterm: e.target.value})}
              >
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
                <option value="DDP">DDP</option>
                <option value="EXW">EXW</option>
                <option value="CPT">CPT</option>
              </select>
            </div>
            <div>
              <label className="block font-mono text-[11px] text-[#9AA5B4] mb-1">Departure Date</label>
              <input
                type="date"
                className="w-full bg-[#0F1115] border border-[#2A2F36] rounded p-2 text-[14px] text-[#F5F5F2] focus:border-[#3A6FF7] focus:outline-none"
                value={formData.departure_date}
                onChange={(e) => setFormData({...formData, departure_date: e.target.value})}
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] text-[#9AA5B4] mb-1">Vessel Name</label>
              <input
                type="text"
                placeholder="Optional"
                className="w-full bg-[#0F1115] border border-[#2A2F36] rounded p-2 text-[14px] text-[#F5F5F2] focus:border-[#3A6FF7] focus:outline-none"
                value={formData.vessel_name}
                onChange={(e) => setFormData({...formData, vessel_name: e.target.value})}
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] text-[#9AA5B4] mb-1">ICEGATE Shipping Bill</label>
              <input
                type="text"
                placeholder="Optional"
                className="w-full bg-[#0F1115] border border-[#2A2F36] rounded p-2 text-[14px] text-[#F5F5F2] focus:border-[#3A6FF7] focus:outline-none font-mono"
                value={formData.icegate_bill_no}
                onChange={(e) => setFormData({...formData, icegate_bill_no: e.target.value})}
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <button
              type="submit"
              disabled={loading}
              className="bg-[#3A6FF7] hover:bg-[#2c57cc] text-white px-6 py-2 rounded font-mono text-[13px] disabled:opacity-50 flex items-center"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Registering...' : 'Register Shipment'}
            </button>
            
            {success && (
              <span className="text-[#22C55E] flex items-center text-[13px] font-mono">
                <CheckCircle2 className="mr-1 h-4 w-4" /> Registered successfully
              </span>
            )}
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded text-[#EF4444] text-[13px] font-mono flex items-start">
              <AlertCircle className="mr-2 h-4 w-4 mt-0.5 flex-shrink-0" />
              <span className="break-all">{error}</span>
            </div>
          )}
        </form>
      </div>

      {/* Shipment List */}
      <div>
        <h3 className="font-mono text-[14px] text-[#9AA5B4] mb-4 uppercase tracking-wider">Active Shipments</h3>
        
        {shipments.length === 0 ? (
          <p className="text-[14px] text-[#4A5568] font-body">No shipments registered yet.</p>
        ) : (
          <div className="space-y-3">
            {shipments.map((s) => (
              <div key={s.id} className="bg-[#161A20] border border-[#2A2F36] rounded-md p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex-1 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] font-mono">
                  <span className="text-[#F5F5F2] font-bold">{s.id}</span>
                  <span className="text-[#9AA5B4]">{s.origin} → {s.destination}</span>
                  <span className="text-[#7DD3FC]">{s.escrow_algo.toFixed(2)} ALGO</span>
                  
                  {/* Status Badge */}
                  <span className={`px-2 py-0.5 rounded text-[11px] ${
                    s.status.includes('Disputed') || s.status.includes('Delayed') ? 'bg-[#EF4444]/20 text-[#EF4444]' :
                    s.status.includes('Settled') ? 'bg-[#22C55E]/20 text-[#22C55E]' :
                    'bg-[#EAB308]/20 text-[#EAB308]'
                  }`}>
                    {s.status.replace('_', ' ')}
                  </span>
                </div>
                
                <button
                  onClick={() => onRunJury(s.id)}
                  className="w-full md:w-auto border border-[#3A6FF7] text-[#3A6FF7] hover:bg-[#3A6FF7]/10 px-4 py-1.5 rounded font-mono text-[12px] transition-colors"
                >
                  Run Jury
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
