import React from 'react';
import { Globe, User } from 'lucide-react';

interface GlobalSessionToggleProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    label?: string;
    description?: string;
}

export const GlobalSessionToggle: React.FC<GlobalSessionToggleProps> = ({
    enabled,
    onChange,
    label = "Aplicar a todas las sesiones",
    description = "Cuando está activado, los menús y auto-respuestas funcionarán en todas las sesiones de WhatsApp conectadas"
}) => {
    return (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                        {enabled ? (
                            <Globe className="w-5 h-5 text-blue-600" />
                        ) : (
                            <User className="w-5 h-5 text-theme-muted" />
                        )}
                    </div>
                    <h4 className="font-semibold text-theme-main text-sm">{label}</h4>
                </div>
                <button
                    onClick={() => onChange(!enabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${enabled ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                    role="switch"
                    aria-checked={enabled}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-theme-card transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                    />
                </button>
            </div>
            <p className="text-xs text-theme-muted mb-2 ml-8">{description}</p>
            <div className="ml-8">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${enabled
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-theme-main'
                    }`}>
                    {enabled ? (
                        <>
                            <Globe className="w-3 h-3" />
                            Todas las sesiones
                        </>
                    ) : (
                        <>
                            <User className="w-3 h-3" />
                            Solo sesión activa
                        </>
                    )}
                </span>
            </div>
        </div>
    );
};

// Componente compacto para mostrar el estado actual
export const GlobalSessionIndicator: React.FC<{ enabled: boolean }> = ({ enabled }) => {
    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${enabled
            ? 'bg-blue-100 text-blue-700 border border-blue-200'
            : 'bg-slate-100 text-theme-main border border-theme'
            }`}>
            {enabled ? (
                <>
                    <Globe className="w-3.5 h-3.5" />
                    <span>Todas las sesiones</span>
                </>
            ) : (
                <>
                    <User className="w-3.5 h-3.5" />
                    <span>Sesión activa</span>
                </>
            )}
        </div>
    );
};
