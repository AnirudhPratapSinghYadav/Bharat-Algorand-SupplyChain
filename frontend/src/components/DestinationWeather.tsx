import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { BACKEND_URL } from '../constants/api';

export type WeatherPayload = {
    city: string;
    temp_c: number;
    precipitation_mm: number;
    wind_kmh: number;
    description: string;
    is_risky?: boolean;
};

function destCityFromShipment(destination: string): string {
    const d = (destination || '').trim();
    if (!d || d === '—') return '';
    return d.split(',')[0].trim();
}

export function useShipmentDestinationWeather(destination: string) {
    const city = destCityFromShipment(destination);
    return useQuery({
        queryKey: ['weather-city', city],
        queryFn: async () => {
            const res = await axios.get<WeatherPayload>(`${BACKEND_URL}/weather/${encodeURIComponent(city)}`, {
                timeout: 8000,
            });
            return res.data;
        },
        enabled: city.length > 0,
        staleTime: 300_000,
        retry: false,
    });
}

export function ShipmentDestinationWeatherRow({ destination }: { destination: string }) {
    const city = destCityFromShipment(destination);
    const q = useShipmentDestinationWeather(destination);
    if (!city || q.isError || !q.data) return null;
    const w = q.data;
    const risky = w.is_risky;
    return (
        <div
            style={{
                fontSize: '0.8rem',
                color: risky ? '#b45309' : '#475569',
                marginBottom: 10,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px 14px',
                alignItems: 'center',
            }}
        >
            <span>🌡 {w.temp_c.toFixed(0)}°C</span>
            <span>💧 {w.precipitation_mm.toFixed(1)}mm</span>
            <span>🌪 {w.wind_kmh.toFixed(0)}km/h</span>
            <span>{w.description}</span>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{w.city}</span>
        </div>
    );
}
