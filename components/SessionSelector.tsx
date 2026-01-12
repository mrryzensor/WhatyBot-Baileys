import React, { useState } from 'react';
import { Layers, ChevronDown, Check, AlertCircle } from 'lucide-react';
import { useSession } from '../context/SessionContext';

export const SessionSelector: React.FC = () => {
    const { sessions, selectedSessionId, setSelectedSessionId, loading } = useSession();
    const [isOpen, setIsOpen] = useState(false);

    // Solo mostrar las sesiones que están conectadas o listas
    const activeSessions = sessions.filter(s => s.status === 'connected' || s.isReady);
    const selectedSession = activeSessions.find(s => s.sessionId === selectedSessionId);

    return (
        <div className="relative inline-block text-left w-full sm:w-auto">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full sm:w-64 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:border-green-400 hover:shadow-md transition-all duration-200 group"
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className={`p-1.5 rounded-lg ${selectedSession ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'} transition-colors`}>
                        <Layers size={16} />
                    </div>
                    <span className="truncate">
                        {selectedSession
                            ? (selectedSession.phoneNumber ? `+${selectedSession.phoneNumber}` : `Sesión ${selectedSession.sessionId.substring(0, 5)}`)
                            : (loading ? 'Cargando...' : 'Seleccionar cuenta')}
                    </span>
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-[60]"
                        onClick={() => setIsOpen(false)}
                    ></div>
                    <div className="absolute right-0 mt-3 w-full sm:w-72 rounded-2xl bg-white shadow-2xl border border-slate-100 z-[70] py-2 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-300">
                        <div className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em] border-b border-slate-50 flex items-center justify-between">
                            <span>Cuentas Conectadas</span>
                            <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{activeSessions.length}</span>
                        </div>

                        <div className="max-h-80 overflow-y-auto scrollbar-thin scroll-smooth">
                            {activeSessions.length === 0 ? (
                                <div className="px-6 py-8 text-center flex flex-col items-center gap-3">
                                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                                        <AlertCircle size={24} />
                                    </div>
                                    <p className="text-sm text-slate-500 px-4">
                                        No hay cuentas conectadas actualmente
                                    </p>
                                </div>
                            ) : (
                                <div className="p-1.5 space-y-1">
                                    {activeSessions.map((session) => (
                                        <button
                                            key={session.sessionId}
                                            onClick={() => {
                                                setSelectedSessionId(session.sessionId);
                                                setIsOpen(false);
                                            }}
                                            className={`flex items-center justify-between w-full px-4 py-3.5 text-left rounded-xl transition-all duration-200 ${selectedSessionId === session.sessionId
                                                    ? 'bg-green-50 text-green-700'
                                                    : 'hover:bg-slate-50 text-slate-600'
                                                }`}
                                        >
                                            <div className="flex flex-col gap-0.5 overflow-hidden">
                                                <span className={`text-sm font-bold truncate ${selectedSessionId === session.sessionId ? 'text-green-700' : 'text-slate-700'
                                                    }`}>
                                                    {session.phoneNumber ? `+${session.phoneNumber}` : 'Sin número'}
                                                </span>
                                                <span className="text-[10px] opacity-60 font-mono tracking-tight">
                                                    ID: {session.sessionId.substring(0, 12)}...
                                                </span>
                                            </div>
                                            {selectedSessionId === session.sessionId && (
                                                <div className="bg-green-500 text-white p-0.5 rounded-full">
                                                    <Check size={14} strokeWidth={3} />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-1 border-t border-slate-50 p-3 bg-slate-50/50">
                            <p className="text-[10px] leading-relaxed text-center text-slate-400 italic font-medium">
                                * Ve a <span className="text-green-600 font-bold">"Panel Principal"</span> para conectar nuevos números.
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
