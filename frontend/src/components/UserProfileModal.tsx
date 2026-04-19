import { Link } from 'react-router-dom';
import { X, Copy, ExternalLink, User, Shield, Hash } from 'lucide-react';

type Props = {
    open: boolean;
    onClose: () => void;
    address: string;
    role: 'stakeholder' | 'supplier';
    appId: number | null;
};

const EXPLORER_ACCOUNT = 'https://testnet.explorer.perawallet.app/account/';

export function UserProfileModal({ open, onClose, address, role, appId }: Props) {
    if (!open) return null;

    const explorerUrl = `${EXPLORER_ACCOUNT}${encodeURIComponent(address)}`;
    const verifyWalletUrl = `/verify/wallet/${encodeURIComponent(address)}`;

    const copy = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            window.prompt(`Copy ${label}:`, text);
        }
    };

    return (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div
                className="card"
                style={{ maxWidth: 440, width: '95%', textAlign: 'left' }}
                role="dialog"
                aria-labelledby="profile-modal-title"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.35), rgba(167, 139, 250, 0.35))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <User size={22} color="#e0e7ff" />
                        </div>
                        <div>
                            <h3 id="profile-modal-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                                Your profile
                            </h3>
                            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                                Connected with Pera · Algorand TestNet
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                        aria-label="Close profile"
                    >
                        <X size={18} color="#9ca3af" />
                    </button>
                </div>

                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 999,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        marginBottom: 16,
                        background: role === 'stakeholder' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: role === 'stakeholder' ? '#7dd3fc' : '#fbbf24',
                        border: `1px solid ${role === 'stakeholder' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                    }}
                >
                    <Shield size={12} />
                    {role === 'stakeholder' ? 'Stakeholder (buyer)' : 'Supplier'}
                </div>

                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', marginBottom: 6 }}>
                        FULL ADDRESS
                    </div>
                    <p
                        style={{
                            margin: 0,
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '0.78rem',
                            lineHeight: 1.5,
                            wordBreak: 'break-all',
                            color: '#e2e8f0',
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: 'rgba(15, 23, 42, 0.85)',
                            border: '1px solid rgba(148, 163, 184, 0.25)',
                        }}
                    >
                        {address}
                    </p>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                    <button
                        type="button"
                        className="primary-btn"
                        style={{ fontSize: '0.78rem', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => void copy(address, 'address')}
                    >
                        <Copy size={14} /> Copy address
                    </button>
                    <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: '#7dd3fc',
                            textDecoration: 'none',
                            padding: '8px 14px',
                            borderRadius: 8,
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            background: 'rgba(56, 189, 248, 0.08)',
                        }}
                    >
                        <ExternalLink size={14} /> TestNet explorer
                    </a>
                </div>

                <div
                    style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        marginBottom: 14,
                    }}
                >
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>Public verify link</div>
                    <p style={{ margin: '0 0 10px', fontSize: '0.76rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                        Share a read-only view of activity tied to this wallet (no signing required for visitors).
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <Link
                            to={verifyWalletUrl}
                            onClick={onClose}
                            style={{
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                color: '#a5b4fc',
                                textDecoration: 'underline',
                                textUnderlineOffset: 3,
                            }}
                        >
                            Open verify page for this wallet →
                        </Link>
                        <button
                            type="button"
                            onClick={() =>
                                void copy(
                                    typeof window !== 'undefined' ? `${window.location.origin}${verifyWalletUrl}` : verifyWalletUrl,
                                    'link',
                                )
                            }
                            style={{
                                fontSize: '0.75rem',
                                padding: '6px 12px',
                                borderRadius: 6,
                                border: '1px solid #475569',
                                background: 'rgba(148, 163, 184, 0.12)',
                                color: '#e2e8f0',
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            <Copy size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Copy URL
                        </button>
                    </div>
                </div>

                {appId != null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: '#94a3b8' }}>
                        <Hash size={14} />
                        <span>
                            Navi-Trust app ID:{' '}
                            <strong style={{ color: '#e2e8f0', fontFamily: 'ui-monospace, monospace' }}>{appId}</strong>
                        </span>
                    </div>
                ) : (
                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b', lineHeight: 1.45 }}>
                        App ID loads from the API when the backend exposes <code style={{ fontSize: '0.7rem' }}>APP_ID</code>.
                    </p>
                )}

                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="primary-btn" onClick={onClose} style={{ padding: '10px 20px' }}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
