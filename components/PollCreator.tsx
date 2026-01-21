import React, { useState, useRef } from 'react';
import { Send, Plus, Trash2, HelpCircle, Paperclip, ArrowUp, ArrowDown } from 'lucide-react';
import { sendGroupPoll } from '../services/api';
import { useMedia } from '../hooks/useMedia';
import { MediaUpload } from './MediaUpload';
import { MessageEditorToolbar } from './MessageEditorToolbar';
import { BulkProgressBar } from './BulkProgressBar';

interface PollCreatorProps {
    selectedGroupsCount: number;
    selectedGroupIds: Set<string>;
    isConnected: boolean;
    onSendComplete: () => void;
    toast: {
        success: (message: string) => void;
        error: (message: string) => void;
    };
}

export const PollCreator: React.FC<PollCreatorProps> = ({
    selectedGroupsCount,
    selectedGroupIds,
    isConnected,
    onSendComplete,
    toast
}) => {
    const [pollName, setPollName] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);
    const [selectableCount, setSelectableCount] = useState(1);
    const [loading, setLoading] = useState(false);

    // Media
    const media = useMedia({ maxFiles: 50 });
    const [mediaPosition, setMediaPosition] = useState<'before' | 'after'>('after');
    const [showMedia, setShowMedia] = useState(false);

    // Toolbar & Focus Management
    const activeInputRef = useRef<HTMLInputElement | null>(null);
    // We use a dummy state to force re-render if needed, though toolbar mainly acts on ref.
    // However, MessageEditorToolbar requires a RefObject. 
    // We create a persistent ref object that we mutate manually.
    const proxyRef = useRef<HTMLInputElement>(null);

    const [activeField, setActiveField] = useState<string | null>(null);

    const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>, fieldId: string) => {
        // Update the proxy ref to point to the currently focused element
        // @ts-ignore - We are manually updating the readonly current property
        proxyRef.current = e.target;
        activeInputRef.current = e.target;
        setActiveField(fieldId);
    };

    const handleAddOption = () => {
        if (options.length < 12) {
            setOptions([...options, '']);
        }
    };

    const handleRemoveOption = (index: number) => {
        if (options.length > 2) {
            const newOptions = options.filter((_, i) => i !== index);
            setOptions(newOptions);
        }
    };

    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleSendPoll = async () => {
        // Validation
        if (!pollName.trim()) {
            toast.error('Por favor ingresa un nombre o pregunta para la encuesta');
            return;
        }

        const validOptions = options.filter(opt => opt.trim().length > 0);
        if (validOptions.length < 2) {
            toast.error('La encuesta debe tener al menos 2 opciones válidas');
            return;
        }

        if (selectedGroupsCount === 0) {
            toast.error('Selecciona al menos un grupo');
            return;
        }

        setLoading(true);
        try {
            const groupIds = Array.from(selectedGroupIds) as string[];

            const files = media.mediaItems
                .map((item) => item.file)
                .filter((f): f is File => !!f);
            const captions = media.mediaItems.map((item) => item.caption || '');

            const response = await sendGroupPoll(
                groupIds,
                pollName,
                validOptions,
                selectableCount,
                files,
                captions,
                mediaPosition
            );

            if (response.success) {
                toast.success(`¡Encuesta enviada a ${selectedGroupsCount} grupos!`);
                setPollName('');
                setOptions(['', '']);
                setSelectableCount(1);
                media.clearAll();
                onSendComplete();
            }
        } catch (error: any) {
            console.error('Error sending poll:', error);
            toast.error(`Error al enviar encuesta: ${error.message || 'Error desconocido'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col h-full overflow-hidden">
            {/* Media Upload Progress Bar */}
            {media.uploadProgress && (
                <div className="absolute top-0 left-0 right-0 z-10">
                    <BulkProgressBar
                        current={media.uploadProgress.current}
                        total={media.uploadProgress.total}
                        isActive={true}
                        title="Subiendo archivos..."
                        subtitle="Procesando archivos multimedia"
                    />
                </div>
            )}

            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-semibold text-slate-800">Crear Encuesta</h3>
                <div className="group relative">
                    <HelpCircle size={18} className="text-slate-400 cursor-help" />
                    <div className="absolute right-0 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 top-full mt-2">
                        Las encuestas en WhatsApp permiten a los usuarios votar por una o más opciones. Los resultados se actualizan en tiempo real.
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">

                {/* Formatting Toolbar */}
                <div className="sticky top-0 z-20 bg-white shadow-sm rounded-lg mb-2">
                    <MessageEditorToolbar
                        textareaRef={proxyRef}
                        value="" // Not strictly needed as we update specific inputs
                        onChange={(val) => {
                            // Using the toolbar usually calls this onChange. 
                            // Since we have multiple inputs, we need to apply the change to the active one.
                            // However, useMessageEditor (inside toolbar) updates the DOM directly AND calls onChange.
                            // We need to sync React state.
                            if (activeInputRef.current) {
                                if (activeField === 'title') {
                                    setPollName(val);
                                } else if (activeField?.startsWith('option-')) {
                                    const index = parseInt(activeField.split('-')[1]);
                                    if (!isNaN(index)) {
                                        handleOptionChange(index, val);
                                    }
                                }
                            }
                        }}
                        showVariables={false}
                    />
                    <div className="text-[10px] text-slate-400 text-center py-0.5 bg-slate-50 border-t border-slate-100">
                        {activeField ? 'Editando: ' + (activeField === 'title' ? 'Pregunta' : 'Opción ' + (parseInt(activeField.split('-')[1]) + 1)) : 'Selecciona un campo para editar'}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                        Pregunta o Título
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={pollName}
                            onChange={(e) => setPollName(e.target.value)}
                            onFocus={(e) => handleInputFocus(e, 'title')}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none ring-0 active:outline-none"
                            placeholder="¿Qué opinan sobre...?"
                            disabled={loading}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                        Opciones
                    </label>
                    <div className="space-y-2">
                        {options.map((option, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => handleOptionChange(index, e.target.value)}
                                    onFocus={(e) => handleInputFocus(e, `option-${index}`)}
                                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none ring-0"
                                    placeholder={`Opción ${index + 1}`}
                                    disabled={loading}
                                />
                                {options.length > 2 && (
                                    <button
                                        onClick={() => handleRemoveOption(index)}
                                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                        disabled={loading}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {options.length < 12 && (
                        <button
                            onClick={handleAddOption}
                            className="mt-3 flex items-center gap-2 text-sm text-green-600 hover:text-green-700 font-medium"
                            disabled={loading}
                        >
                            <Plus size={16} /> Agregar Opción
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Settings */}
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
                            Configuración
                        </label>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-700">Permitir selección múltiple</span>

                            <button
                                type="button"
                                onClick={() => setSelectableCount(current => current === 1 ? 0 : 1)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 ${selectableCount === 0 ? 'bg-green-600' : 'bg-slate-300'}`}
                                role="switch"
                                aria-checked={selectableCount === 0}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${selectableCount === 0 ? 'translate-x-5' : 'translate-x-0'}`}
                                />
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">
                            {selectableCount === 1
                                ? 'Los usuarios solo podrán elegir una respuesta.'
                                : 'Los usuarios podrán elegir todas las respuestas que quieran.'}
                        </p>
                    </div>

                    {/* Media Toggle */}
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
                            Archivos Adjuntos
                        </label>
                        <button
                            onClick={() => setShowMedia(!showMedia)}
                            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${showMedia ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                        >
                            <Paperclip size={16} />
                            {showMedia ? 'Ocultar Archivos' : 'Adjuntar Archivos'}
                        </button>
                    </div>
                </div>

                {/* Media Section */}
                {showMedia && (
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 animate-fadeIn">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-slate-700">Archivos Multimedia</span>

                            <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5">
                                <button
                                    onClick={() => setMediaPosition('before')}
                                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${mediaPosition === 'before' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
                                    title="Enviar antes de la encuesta"
                                >
                                    <ArrowUp size={12} /> Antes
                                </button>
                                <button
                                    onClick={() => setMediaPosition('after')}
                                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${mediaPosition === 'after' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
                                    title="Enviar después de la encuesta"
                                >
                                    <ArrowDown size={12} /> Después
                                </button>
                            </div>
                        </div>

                        <MediaUpload
                            mediaItems={media.mediaItems}
                            onMediaChange={media.setMediaItems}
                            maxFiles={50}
                            fileInputRef={media.fileInputRef}
                            onFileSelect={media.handleFileSelect}
                            onDrop={media.handleDrop}
                            onOpenFileSelector={media.openFileSelector}
                            onRemoveMedia={media.removeMedia}
                            onUpdateCaption={media.updateCaption}
                        />
                    </div>
                )}

            </div>

            <div className="pt-4 mt-auto border-t border-slate-100 flex justify-between items-center bg-white sticky bottom-0 p-4">
                <div className="text-sm text-slate-500">
                    Seleccionados: <span className="font-bold text-slate-800">{selectedGroupsCount}</span>
                </div>
                <button
                    onClick={handleSendPoll}
                    disabled={!isConnected || selectedGroupsCount === 0 || loading || !pollName || options.filter(o => o.trim()).length < 2}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium shadow-lg shadow-green-900/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {loading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Enviando...
                        </>
                    ) : (
                        <>
                            <Send size={18} /> Enviar Encuesta
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
