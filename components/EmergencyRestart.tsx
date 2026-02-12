import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function EmergencyRestart() {
    const [isRestarting, setIsRestarting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [errorCount, setErrorCount] = useState(0);

    useEffect(() => {
        if (!window.electronAPI?.emergency) {
            return; // Solo funciona en Electron
        }

        // Verificar la salud del backend cada 10 segundos
        const checkBackendHealth = async () => {
            try {
                const backendPort = localStorage.getItem('backendPort') || '23456';
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos timeout

                const response = await fetch(`http://localhost:${backendPort}/api/health`, {
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    setErrorCount(prev => prev + 1);
                } else {
                    setErrorCount(0);
                    setHasError(false);
                }
            } catch (error: any) {
                // Error de conexión, timeout, o 504
                setErrorCount(prev => prev + 1);
            }
        };

        // Mostrar botón después de 2 errores consecutivos
        const interval = setInterval(() => {
            checkBackendHealth();
        }, 10000);

        // Check inmediato al montar
        checkBackendHealth();

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        // Mostrar botón después de 2 errores consecutivos
        if (errorCount >= 2) {
            setHasError(true);
        }
    }, [errorCount]);

    const handleEmergencyRestart = async () => {
        if (!window.electronAPI?.emergency?.restart) {
            alert('Esta función solo está disponible en la aplicación de escritorio.');
            return;
        }

        setIsRestarting(true);
        try {
            await window.electronAPI.emergency.restart();
            // La aplicación se reiniciará, así que este código probablemente no se ejecutará
        } catch (error: any) {
            console.error('Error al reiniciar:', error);
            alert('Error al reiniciar la aplicación: ' + error.message);
            setIsRestarting(false);
        }
    };

    // No mostrar si no estamos en Electron o si no hay error
    if (!window.electronAPI?.emergency || !hasError) {
        return null;
    }

    return (
        <div className="fixed bottom-4 right-4 z-50">
            {showConfirm ? (
                <div className="bg-red-600 text-white rounded-lg shadow-2xl p-4 max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-start gap-3 mb-3">
                        <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-bold text-sm mb-1">⚠️ Reinicio de Emergencia</h3>
                            <p className="text-xs opacity-90">
                                Se detectaron problemas de conexión con el servidor.
                                Esto matará todos los procesos Node.js y reiniciará la aplicación.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowConfirm(false)}
                            className="flex-1 px-3 py-2 bg-theme-card/20 hover:bg-theme-card/30 rounded text-xs font-medium transition-colors"
                            disabled={isRestarting}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleEmergencyRestart}
                            disabled={isRestarting}
                            className="flex-1 px-3 py-2 bg-theme-card text-red-600 hover:bg-red-50 rounded text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                            {isRestarting ? (
                                <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    Reiniciando...
                                </>
                            ) : (
                                'Confirmar Reinicio'
                            )}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setShowConfirm(true)}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-full p-3 shadow-lg transition-all hover:scale-110 active:scale-95 group animate-in fade-in slide-in-from-bottom-4 duration-300"
                    title="Servidor no responde - Reinicio de emergencia disponible"
                >
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                </button>
            )}
        </div>
    );
}
