import React from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Error capturado por ErrorBoundary:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-lg border border-red-200 p-8 max-w-md w-full">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                                <AlertCircle size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">¡Oops! Algo salió mal</h2>
                                <p className="text-sm text-slate-500">La aplicación encontró un error</p>
                            </div>
                        </div>

                        {this.state.error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                                <p className="text-sm font-mono text-red-800 break-all">
                                    {this.state.error.message}
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <button
                                onClick={this.handleReset}
                                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                            >
                                Recargar Aplicación
                            </button>
                            <p className="text-xs text-slate-400 text-center">
                                Si el problema persiste, verifica la consola del navegador
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
