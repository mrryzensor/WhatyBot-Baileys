import React, { useState } from 'react';
import { X, Upload, Globe, User } from 'lucide-react';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (file: File, applyToAllSessions: boolean) => void;
    title: string;
    description: string;
    acceptedFormats?: string;
}

export const ImportModal: React.FC<ImportModalProps> = ({
    isOpen,
    onClose,
    onImport,
    title,
    description,
    acceptedFormats = ".json,.zip"
}) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [applyToAllSessions, setApplyToAllSessions] = useState(false);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleImport = () => {
        if (selectedFile) {
            onImport(selectedFile, applyToAllSessions);
            setSelectedFile(null);
            setApplyToAllSessions(false);
            onClose();
        }
    };

    const handleClose = () => {
        setSelectedFile(null);
        setApplyToAllSessions(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-theme-card rounded-2xl shadow-2xl max-w-md w-full mx-4 animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-theme">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-100 rounded-lg">
                            <Upload className="w-5 h-5 text-primary-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-theme-main">{title}</h3>
                            <p className="text-xs text-theme-muted">{description}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-theme-muted" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {/* File Input */}
                    <div>
                        <label className="block text-sm font-medium text-theme-main mb-2">
                            Seleccionar archivo
                        </label>
                        <input
                            type="file"
                            accept={acceptedFormats}
                            onChange={handleFileChange}
                            className="block w-full text-sm text-theme-muted
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                cursor-pointer"
                        />
                        {selectedFile && (
                            <p className="mt-2 text-xs text-theme-muted">
                                Archivo seleccionado: <span className="font-medium">{selectedFile.name}</span>
                            </p>
                        )}
                    </div>

                    {/* Session Scope Toggle */}
                    <div className="border border-theme rounded-xl p-4 bg-theme-base">
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                                {applyToAllSessions ? (
                                    <Globe className="w-5 h-5 text-blue-600" />
                                ) : (
                                    <User className="w-5 h-5 text-theme-muted" />
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-theme-main">
                                        Ámbito de importación
                                    </label>
                                    <button
                                        onClick={() => setApplyToAllSessions(!applyToAllSessions)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${applyToAllSessions ? 'bg-blue-600' : 'bg-slate-300'
                                            }`}
                                        role="switch"
                                        aria-checked={applyToAllSessions}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-theme-card transition-transform ${applyToAllSessions ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                </div>
                                <p className="text-xs text-theme-muted">
                                    {applyToAllSessions
                                        ? 'Se importará a todas las sesiones de WhatsApp conectadas'
                                        : 'Se importará solo a la sesión actualmente seleccionada'}
                                </p>
                                <div className="mt-2">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${applyToAllSessions
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-slate-100 text-theme-main'
                                        }`}>
                                        {applyToAllSessions ? (
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
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-theme bg-theme-base rounded-b-2xl">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm font-medium text-theme-main hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={!selectedFile}
                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4" />
                        Importar
                    </button>
                </div>
            </div>
        </div>
    );
};
