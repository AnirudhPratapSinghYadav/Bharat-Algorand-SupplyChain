import { useEffect, useState } from 'react';
import axios from 'axios';
import { BACKEND_URL, API_TIMEOUT } from '../constants/api';

type Item = { title: string; link?: string; source?: string };

export function NewsTicker() {
    const [items, setItems] = useState<Item[]>([]);

    useEffect(() => {
        const load = async () => {
            try {
                const r = await axios.get<{ items?: Item[] }>(`${BACKEND_URL}/news/live`, { timeout: API_TIMEOUT });
                setItems(Array.isArray(r.data?.items) ? r.data.items! : []);
            } catch {
                setItems([]);
            }
        };
        void load();
        const id = window.setInterval(() => void load(), 5 * 60_000);
        return () => window.clearInterval(id);
    }, []);

    if (!items.length) return null;

    return (
        <div
            className="nt-news-ticker"
            style={{
                marginBottom: 12,
                borderRadius: 8,
                border: '1px solid rgba(56,189,248,0.25)',
                background: 'rgba(15,23,42,0.55)',
                display: 'flex',
                alignItems: 'stretch',
                minHeight: 36,
            }}
        >
            <span
                style={{
                    flexShrink: 0,
                    padding: '0 12px',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: '#38bdf8',
                    borderRight: '1px solid rgba(56,189,248,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                LIVE
            </span>
            <div
                style={{
                    flex: 1,
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                    fontSize: '0.78rem',
                    color: '#cbd5e1',
                    padding: '8px 12px',
                    scrollbarWidth: 'thin',
                }}
            >
                {items.map((i, idx) => (
                    <span key={`${i.title}-${idx}`}>
                        {idx > 0 ? <span style={{ color: '#64748b' }}> · </span> : null}
                        {i.link ? (
                            <a href={i.link} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none' }}>
                                {i.title}
                            </a>
                        ) : (
                            i.title
                        )}
                    </span>
                ))}
            </div>
        </div>
    );
}
