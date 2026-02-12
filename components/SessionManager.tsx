import React, { useState, useEffect, useImperativeHandle } from 'react';
import { getSessions, createSession, initializeSession, getSessionQR, destroySession } from '../services/sessionsApi';
import { getSocket } from '../services/api';
import { ConfirmModal } from './ConfirmModal';
import { Trash2, Calendar, Infinity as InfinityIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Session {
    sessionId: string;
    userId: string;
    phoneNumber: string | null;
    status: string;
    createdAt: string;
    isReady: boolean;
}

interface SessionManagerProps {
    currentUser: any;
    isDashboardWidget?: boolean;
}

export interface SessionManagerHandle {
    createSession: () => void;
}

export const SessionManager = React.forwardRef<SessionManagerHandle, SessionManagerProps>(({ currentUser, isDashboardWidget = false }, ref) => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedSession, setSelectedSession] = useState<string | null>(null);
    const selectedSessionRef = React.useRef<string | null>(null); // Ref para acceder dentro del listener
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [showQRModal, setShowQRModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

    // Mantener el ref actualizado
    useEffect(() => {
        selectedSessionRef.current = selectedSession;
    }, [selectedSession]);

    // Exponer métodos al padre
    React.useImperativeHandle(ref, () => ({
        createSession: handleCreateSession
    }));

    // Efecto de seguridad para cerrar el modal si el estado cambia a connected
    useEffect(() => {
        if (selectedSession && showQRModal) {
            const session = sessions.find(s => s.sessionId === selectedSession);
            if (session && (session.status === 'connected' || session.isReady)) {
                console.log('[Frontend] Closing QR modal via status check effect');
                setShowQRModal(false);
                setQrCode(null);
                setSelectedSession(null);
                toast.success('¡Conexión Exitosa!');
            }
        }
    }, [sessions, selectedSession, showQRModal]);

    useEffect(() => {
        loadSessions();

        // Listen for session events from socket
        const setupListeners = (s: any) => {
            if (!s) return;
            console.log('[Frontend] Setting up socket listeners in SessionManager');
            s.on('session_created', handleSessionCreated);
            s.on('session_updated', handleSessionUpdated);
            s.on('session_destroyed', handleSessionDestroyed);
            s.on('ready', handleWhatsAppReady);
            s.on('authenticated', handleWhatsAppAuthenticated);
            s.on('qr', handleWhatsAppQR);
            s.on('phone_limit_exceeded', handlePhoneLimitExceeded);
        };

        const removeListeners = (s: any) => {
            if (!s) return;
            s.off('session_created', handleSessionCreated);
            s.off('session_updated', handleSessionUpdated);
            s.off('session_destroyed', handleSessionDestroyed);
            s.off('ready', handleWhatsAppReady);
            s.off('authenticated', handleWhatsAppAuthenticated);
            s.off('qr', handleWhatsAppQR);
            s.off('phone_limit_exceeded', handlePhoneLimitExceeded);
        };

        const socket = getSocket();
        let interval: any;

        if (socket) {
            setupListeners(socket);
        } else {
            console.log('[Frontend] Socket not ready yet in SessionManager, polling...');
            interval = setInterval(() => {
                const currentSocket = getSocket();
                if (currentSocket) {
                    setupListeners(currentSocket);
                    clearInterval(interval);
                }
            }, 1000);
        }

        return () => {
            if (interval) clearInterval(interval);
            removeListeners(getSocket());
        };
    }, []);

    const handlePhoneLimitExceeded = (data: any) => {
        console.log('[Frontend] Phone limit exceeded event received in SessionManager');
        if (showQRModal) {
            setShowQRModal(false);
            setQrCode(null);
            setSelectedSession(null);
        }
    };

    const handleWhatsAppReady = (data: any) => {
        if (!data.sessionId) return;
        console.log('[Frontend] Direct ready event received for session:', data.sessionId);
        handleSessionUpdated({
            sessionId: data.sessionId,
            status: 'connected',
            isReady: true,
            phoneNumber: data.phone
        });
    };

    const handleWhatsAppAuthenticated = (data: any) => {
        if (!data.sessionId) return;
        console.log('[Frontend] Direct authenticated event received for session:', data.sessionId);
        handleSessionUpdated({
            sessionId: data.sessionId,
            status: 'connected', // Marcar como conectado para cerrar el modal
            isReady: true,
            phoneNumber: data.phone
        });
    };

    const handleWhatsAppQR = (data: any) => {
        if (!data.sessionId) return;
        console.log('[Frontend] Direct QR event received for session:', data.sessionId);

        // Si es la sesión que tenemos abierta en el modal, actualizar el QR
        if (selectedSessionRef.current === data.sessionId) {
            setQrCode(data.qr);
        }

        // También actualizar el estado de la sesión
        setSessions(prev => prev.map(s =>
            s.sessionId === data.sessionId
                ? { ...s, status: 'waiting_qr' }
                : s
        ));
    };

    const handleSessionCreated = (data: any) => {
        toast.info(`Nueva sesión creada: ${data.sessionId}`);
        loadSessions();
    };

    const handleSessionUpdated = (data: any) => {
        console.log('[Frontend] session_updated event received:', data);
        const currentSelected = selectedSessionRef.current; // Leer del ref

        setSessions(prev => prev.map(session =>
            session.sessionId === data.sessionId
                ? { ...session, ...data }
                : session
        ));

        // Provocar el cierre del modal si la sesión seleccionada se conecta
        if (data.sessionId === currentSelected && (data.status === 'connected' || data.isReady)) {
            console.log('[Frontend] Successful connection detected for selected session. Closing modal.');
            setShowQRModal(false);
            setQrCode(null);
            setSelectedSession(null);
            toast.success('¡Conexión Exitosa!');
            loadSessions(); // Recargar para obtener el número de teléfono actualizado si no venía en el evento
        }
    };

    const handleSessionDestroyed = (data: any) => {
        toast.info(`Sesión eliminada: ${data.sessionId}`);
        loadSessions();
    };

    const loadSessions = async () => {
        try {
            setLoading(true);
            const response = await getSessions();
            if (response.success) {
                setSessions(response.sessions);
            }
        } catch (error: any) {
            toast.error('Error al cargar sesiones: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSession = async () => {
        try {
            setLoading(true);
            const response = await createSession();

            if (response.success) {
                toast.success('Sesión creada exitosamente');
                await loadSessions();

                // Auto-inicializar la nueva sesión
                if (response.sessionId) {
                    await handleInitializeSession(response.sessionId);
                }
            } else {
                toast.error(response.error || 'Error al crear sesión');
            }
        } catch (error: any) {
            toast.error('Error al crear sesión: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleInitializeSession = async (sessionId: string) => {
        try {
            setLoading(true);
            const response = await initializeSession(sessionId);

            if (response.success) {
                toast.success('Sesión inicializada');
                setSelectedSession(sessionId);

                // Esperar un momento y obtener el QR
                setTimeout(async () => {
                    await handleGetQR(sessionId);
                }, 2000);
            } else {
                toast.error(response.error || 'Error al inicializar sesión');
            }
        } catch (error: any) {
            toast.error('Error al inicializar sesión: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGetQR = async (sessionId: string) => {
        try {
            const response = await getSessionQR(sessionId);

            if (response.success && response.qr) {
                setQrCode(response.qr);
                setSelectedSession(sessionId);
                setShowQRModal(true);
            } else {
                toast.warning('QR no disponible aún. Intenta nuevamente en unos segundos.');
            }
        } catch (error: any) {
            toast.error('Error al obtener QR: ' + error.message);
        }
    };

    const handleDestroySession = async (sessionId: string) => {
        setSessionToDelete(sessionId);
        setShowDeleteModal(true);
    };

    const confirmDestroySession = async () => {
        if (!sessionToDelete) return;

        const sessionId = sessionToDelete;

        try {
            setLoading(true);
            const response = await destroySession(sessionId);

            if (response.success) {
                toast.success('Sesión eliminada exitosamente');
                await loadSessions();

                if (selectedSession === sessionId) {
                    setSelectedSession(null);
                    setQrCode(null);
                    setShowQRModal(false);
                }
            } else {
                toast.error(response.error || 'Error al eliminar sesión');
            }
        } catch (error: any) {
            toast.error('Error al eliminar sesión: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (session: Session) => {
        if (session.isReady) {
            return (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
                    Conectado
                </span>
            );
        }

        switch (session.status) {
            case 'initializing':
                return (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        Iniciando
                    </span>
                );
            case 'waiting_qr':
                return (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                        Esperando QR
                    </span>
                );
            case 'connected':
                return (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
                        Conectado
                    </span>
                );
            default:
                return (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                        {session.status}
                    </span>
                );
        }
    };

    const getSessionLimits = () => {
        return Infinity;
    };

    useImperativeHandle(ref, () => ({
        createSession: handleCreateSession
    }));

    return (
        <>
            <div className="bg-theme-card rounded-xl shadow-sm border border-theme overflow-hidden">
                <div className="p-6">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="font-semibold text-theme-main flex items-center gap-2">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                    <rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect>
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <line x1="12" y1="6" x2="12" y2="2"></line>
                                    <line x1="12" y1="22" x2="12" y2="18"></line>
                                </svg>
                                Conexiones ({sessions.length}/∞)
                            </h3>
                            <button
                                onClick={handleCreateSession}
                                disabled={loading}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? '...' : '+ Nueva'}
                            </button>
                        </div>
                        <div className="h-[350px] overflow-y-auto pr-2 -mr-2">
                            <div className="grid gap-3 grid-cols-1">
                                {sessions.map((session) => (
                                    <div
                                        key={session.sessionId}
                                        className="bg-theme-card rounded-lg shadow-sm border border-theme p-3 hover:shadow-md transition-shadow relative overflow-hidden group"
                                    >
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${session.isReady ? 'bg-primary-500' :
                                            session.status === 'connected' ? 'bg-orange-500' :
                                                session.status === 'waiting_qr' ? 'bg-yellow-500' :
                                                    'bg-blue-500'
                                            }`}></div>

                                        <div className="flex items-center justify-between mb-1.5 pl-1">
                                            <div className="flex flex-col">
                                                <h4 className="font-bold text-theme-main text-base leading-tight">
                                                    {session.phoneNumber ? `+${session.phoneNumber.replace('+', '')}` : 'Sin número'}
                                                </h4>
                                                <p className="text-xs text-slate-400 font-mono mt-0.5" title={session.sessionId}>
                                                    ID: {session.sessionId.substring(0, 8)}...
                                                </p>
                                            </div>
                                            <div className="scale-95 origin-right">
                                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${session.isReady ? 'bg-primary-100 text-primary-700' :
                                                    session.status === 'connected' ? 'bg-orange-100 text-orange-700' :
                                                        session.status === 'waiting_qr' ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {session.isReady ? 'Conectado' :
                                                        session.status === 'connected' ? 'Sincronizando' :
                                                            session.status === 'waiting_qr' ? 'Esperando QR' :
                                                                'Iniciando'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pl-1 mb-2">
                                            <div className="flex items-center gap-1.5 text-xs text-theme-muted">
                                                <Calendar size={14} className="opacity-70" />
                                                <span>
                                                    {new Date(session.createdAt).toLocaleString('es-ES', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            </div>

                                            {/* Botones de acción en la misma línea */}
                                            <div className="flex items-center gap-2">
                                                {session.isReady ? (
                                                    <button
                                                        onClick={() => handleInitializeSession(session.sessionId)}
                                                        className="p-2 bg-orange-100 text-orange-600 rounded-md hover:bg-orange-200 transition-colors flex items-center justify-center shrink-0"
                                                        title="Reiniciar sesión si hay problemas"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                    </button>
                                                ) : (
                                                    <>
                                                        {session.status === 'waiting_qr' && (
                                                            <button
                                                                onClick={() => handleGetQR(session.sessionId)}
                                                                className="p-2 bg-blue-100 text-blue-600 rounded-md hover:bg-blue-200 transition-colors flex items-center justify-center shrink-0"
                                                                title="Ver código QR"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                        {(session.status === 'initializing' || session.status === 'connected') && (
                                                            <button
                                                                onClick={() => handleInitializeSession(session.sessionId)}
                                                                className="p-2 bg-primary-100 text-primary-600 rounded-md hover:bg-primary-200 transition-colors flex items-center justify-center shrink-0"
                                                                title={session.status === 'connected' ? 'Forzar inicio de sesión' : 'Iniciar sesión'}
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </>
                                                )}

                                                <button
                                                    onClick={() => handleDestroySession(session.sessionId)}
                                                    className="p-2 bg-red-100 text-red-600 rounded-md hover:bg-red-200 transition-colors flex items-center justify-center shrink-0"
                                                    title="Eliminar Sesión"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>

                                    </div>
                                ))}
                                {sessions.length === 0 && (
                                    <div className="text-center py-8 text-slate-400 text-sm">
                                        No hay sesiones activas. Crea una nueva.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* QR Modal */}
            {showQRModal && qrCode && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-theme-card rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-theme-main">Escanea el código QR</h3>
                            <button
                                onClick={() => {
                                    setShowQRModal(false);
                                    setQrCode(null);
                                }}
                                className="text-slate-400 hover:text-theme-muted transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="bg-theme-base rounded-xl p-4 mb-4">
                            <img src={qrCode} alt="QR Code" className="w-full h-auto" />
                        </div>

                        <div className="space-y-2 text-sm text-theme-muted">
                            <p className="flex items-start gap-2">
                                <span className="text-primary-500 mt-1">1.</span>
                                Abre WhatsApp en tu teléfono
                            </p>
                            <p className="flex items-start gap-2">
                                <span className="text-primary-500 mt-1">2.</span>
                                Ve a <strong>Configuración → Dispositivos vinculados</strong>
                            </p>
                            <p className="flex items-start gap-2">
                                <span className="text-primary-500 mt-1">3.</span>
                                Toca <strong>Vincular un dispositivo</strong>
                            </p>
                            <p className="flex items-start gap-2">
                                <span className="text-primary-500 mt-1">4.</span>
                                Escanea este código QR
                            </p>
                        </div>

                        <button
                            onClick={() => handleGetQR(selectedSession!)}
                            className="w-full mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                        >
                            Actualizar QR
                        </button>
                    </div>
                </div>
            )}

            {/* Confirm Delete Modal */}
            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setSessionToDelete(null);
                }}
                onConfirm={confirmDestroySession}
                title="Eliminar Sesión"
                message="¿Estás seguro de eliminar esta sesión? Se perderá la conexión de WhatsApp y tendrás que escanear el QR nuevamente para volver a conectarla."
                confirmText="Eliminar"
                cancelText="Cancelar"
                type="danger"
            />
        </>
    );
});
