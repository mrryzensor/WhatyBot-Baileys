import React, { useState, useRef } from 'react';
import { Plus, Trash2, Edit2, Save, Bot, Clock, ToggleLeft, ToggleRight, X, Download, Upload, Image, Video, FileText, Paperclip } from 'lucide-react';
import { AutoReplyRule } from '../types';
import { createAutoReplyRule, updateAutoReplyRule, deleteAutoReplyRule, importAutoReplyRules, getAutoReplyRules } from '../services/api';
import { MediaUpload } from './MediaUpload';
import { MessageEditorToolbar } from './MessageEditorToolbar';
import { MessagePreview } from './MessagePreview';
import { BulkProgressBar } from './BulkProgressBar';
import { ConfirmModal } from './ConfirmModal';
import { useMedia, MediaItem as UseMediaItem } from '../hooks/useMedia';

// Component for media thumbnail with error handling
const MediaThumbnail: React.FC<{ src: string; type: 'image' | 'video' | 'document'; caption?: string }> = ({ src, type, caption }) => {
    const [imageError, setImageError] = useState(false);

    if (imageError || type !== 'image') {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="text-center">
                    <Image className="w-8 h-8 text-blue-500 mx-auto mb-1" />
                    <p className="text-xs text-slate-600 font-medium">Imagen</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <img 
                src={src} 
                alt={caption || "Media preview"}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
            />
            {caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-xs text-white line-clamp-1">{caption}</p>
                </div>
            )}
        </>
    );
};

interface AutoReplyManagerProps {
    rules: AutoReplyRule[];
    setRules: (rules: AutoReplyRule[]) => void;
    toast?: {
        success: (message: string) => void;
        error: (message: string) => void;
        warning: (message: string) => void;
        info: (message: string) => void;
    };
}

export const AutoReplyManager: React.FC<AutoReplyManagerProps> = ({ rules, setRules, toast }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);

    // Helper function to get media preview URL
    const getMediaPreviewUrl = (mediaPath: string): string => {
        if (mediaPath.startsWith('http')) {
            return mediaPath;
        }
        const fileName = mediaPath.split(/[/\\]/).pop() || '';
        return `${window.location.protocol}//${window.location.host}/uploads/${fileName}`;
    };

    // Helper function to get media type from path
    const getMediaTypeFromPath = (path: string): 'image' | 'video' | 'document' => {
        const ext = path.toLowerCase().split('.').pop() || '';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
        if (['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv', 'wmv'].includes(ext)) return 'video';
        return 'document';
    };

    // Form State
    const [formData, setFormData] = useState<Partial<AutoReplyRule>>({
        name: '',
        keywords: [],
        response: '',
        matchType: 'contains',
        delay: 2,
        isActive: true
    });

    const [keywordInput, setKeywordInput] = useState('');
    const media = useMedia({ maxFiles: 50 });
    const importInputRef = useRef<HTMLInputElement>(null);
    const messageTextareaRef = useRef<HTMLTextAreaElement>(null);

    const resetForm = () => {
        setFormData({
            name: '',
            keywords: [],
            response: '',
            matchType: 'contains',
            delay: 2,
            isActive: true
        });
        setKeywordInput('');
        media.setMediaItems([]);
        setEditingId(null);
    };

    const handleEdit = (rule: AutoReplyRule) => {
        setEditingId(rule.id);
        setFormData({ ...rule });
        
        // Normalize keywords to array before joining
        let keywordsArray: string[] = [];
        if (Array.isArray(rule.keywords)) {
            keywordsArray = rule.keywords;
        } else if (typeof rule.keywords === 'string') {
            try {
                keywordsArray = JSON.parse(rule.keywords as string);
            } catch {
                keywordsArray = (rule.keywords as string)
                    .split(',')
                    .map((k: string) => k.trim())
                    .filter((k: string) => k.length > 0);
            }
        }
        setKeywordInput(keywordsArray.join(', '));

        // Helper to infer media type from path
        const getMediaTypeFromPath = (path: string): 'image' | 'video' | 'document' => {
            const ext = path.toLowerCase().split('.').pop() || '';
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
            if (['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv', 'wmv'].includes(ext)) return 'video';
            return 'document';
        };

        // Cargar múltiples medias si existen en la regla (mediaPaths + captions)
        if (Array.isArray((rule as any).mediaPaths) && (rule as any).mediaPaths.length > 0) {
            const mediaPaths: string[] = (rule as any).mediaPaths.filter((p: any) => !!p);
            const captionsArray: string[] = Array.isArray((rule as any).captions)
                ? (rule as any).captions
                : mediaPaths.map(() => rule.caption || '');

            const items: UseMediaItem[] = mediaPaths.map((mp, index) => {
                const fileName = mp.split(/[/\\]/).pop() || 'archivo';
                const previewUrl = mp.startsWith('http')
                    ? mp
                    : `${window.location.protocol}//${window.location.host}/uploads/${mp.replace(/^.*[\\/]/, '')}`;

                return {
                    preview: previewUrl,
                    caption: captionsArray[index] || '',
                    type: getMediaTypeFromPath(mp),
                    mediaPath: mp,
                    fileName
                };
            });

            media.setMediaItems(items);
        } else if (rule.mediaPath) {
            // Compatibilidad: una sola mediaPath antigua
            const mp = rule.mediaPath;
            const fileName = mp.split(/[/\\]/).pop() || 'archivo';
            const previewUrl = mp.startsWith('http')
                ? mp
                : `${window.location.protocol}//${window.location.host}/uploads/${mp.replace(/^.*[\\/]/, '')}`;

            const mediaItem: UseMediaItem = {
                preview: previewUrl,
                caption: rule.caption || '',
                type: getMediaTypeFromPath(mp),
                mediaPath: mp,
                fileName
            };

            media.setMediaItems([mediaItem]);
        } else {
            media.setMediaItems([]);
        }
    };

    const handleSave = async () => {
        const errors: { [key: string]: string } = {};
        
        if (!formData.name) {
            errors.name = 'Nombre es requerido';
        }
        if (!formData.response && media.mediaItems.length === 0) {
            errors.response = 'Respuesta o archivo multimedia es requerido';
        }
        
        const processedKeywords = keywordInput.split(',').map(k => k.trim()).filter(k => k.length > 0);
        if (processedKeywords.length === 0) {
            errors.keywords = 'Debes agregar al menos una palabra clave';
        }
        
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }
        
        setFormErrors({});

        setIsLoading(true);
        try {
            // Construir arrays de archivos y captions desde todos los mediaItems
            const files = media.mediaItems
                .map(item => item.file)
                .filter((f): f is File => !!f);
            const captions = media.mediaItems.map(item => item.caption || '');

            // Si estamos editando y no hay nuevos archivos, preservamos las rutas existentes (pueden ser varias)
            const existingMediaPaths = editingId && files.length === 0 && media.mediaItems.length > 0
                ? media.mediaItems
                    .map(item => item.mediaPath)
                    .filter((p): p is string => !!p)
                : undefined;

            console.log('[AutoReplyManager] handleSave - files:', files, 'captions:', captions, 'existingMediaPaths:', existingMediaPaths);

            const ruleData = {
                name: formData.name!,
                keywords: processedKeywords,
                response: formData.response || '',
                matchType: formData.matchType as 'exact' | 'contains',
                delay: formData.delay || 0,
                isActive: formData.isActive ?? true,
                caption: captions[0] || '',
                captions
            };

            if (editingId) {
                // Si editamos y no hay nuevos archivos, pasamos existingMediaPaths para preservar los actuales
                console.log('[AutoReplyManager] updateAutoReplyRule payload:', { id: editingId, ruleData, files, existingMediaPaths });
                const response = await updateAutoReplyRule(editingId, ruleData, files, existingMediaPaths);
                if (response.success) {
                    setRules(rules.map(r => r.id === editingId ? response.rule : r));
                    resetForm();
                }
            } else {
                console.log('[AutoReplyManager] createAutoReplyRule payload:', { ruleData, files, captions });
                const response = await createAutoReplyRule(ruleData, files, captions);
                if (response.success) {
                    setRules([...rules, response.rule]);
                    resetForm();
                }
            }
        } catch (error: any) {
            console.error('Error saving rule:', error);
            if (toast) {
                toast.error('Error al guardar la regla: ' + error.message);
            } else {
                setFormErrors({ general: 'Error al guardar la regla: ' + error.message });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = (id: string) => {
        setRuleToDelete(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!ruleToDelete) return;
        
        const rule = rules.find(r => r.id === ruleToDelete);
        const ruleName = rule?.name || 'esta regla';
        
        try {
            setIsLoading(true);
            await deleteAutoReplyRule(ruleToDelete);
            setRules(rules.filter(r => r.id !== ruleToDelete));
                if (toast) {
                toast.success(`Regla "${ruleName}" eliminada exitosamente`);
                }
            } catch (error: any) {
                console.error('Error deleting rule:', error);
                if (toast) {
                    toast.error('Error al eliminar la regla: ' + error.message);
                }
        } finally {
            setIsLoading(false);
            setShowDeleteModal(false);
            setRuleToDelete(null);
        }
    };

    const toggleStatus = async (id: string) => {
        const rule = rules.find(r => r.id === id);
        if (!rule) return;

        try {
            setIsLoading(true);
            const updatedRule = { ...rule, isActive: !rule.isActive };
            const response = await updateAutoReplyRule(id, updatedRule);
            if (response.success) {
                setRules(rules.map(r => r.id === id ? response.rule : r));
                if (toast) {
                    const newStatus = response.rule.isActive;
                    toast.success(`Regla "${rule.name}" ${newStatus ? 'activada' : 'desactivada'} exitosamente`);
                }
            }
        } catch (error: any) {
            console.error('Error toggling status:', error);
            if (toast) {
                toast.error('Error al actualizar estado: ' + error.message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Export rules to JSON file
    const handleExportRules = () => {
        try {
            // Prepare rules for export (include media filename for reference)
            const rulesToExport = rules.map(rule => {
                const exportRule: any = {
                name: rule.name,
                keywords: rule.keywords,
                response: rule.response,
                matchType: rule.matchType,
                delay: rule.delay,
                isActive: rule.isActive,
                caption: rule.caption || ''
                };
                
                // Include full media path for automatic import
                if (rule.mediaPath) {
                    exportRule.mediaPath = rule.mediaPath; // Path completo para importación automática
                }
                
                return exportRule;
            });

            const dataStr = JSON.stringify(rulesToExport, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `auto-reply-rules-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (toast) {
                toast.success(`Se exportaron ${rules.length} regla(s) exitosamente`);
            }
        } catch (error: any) {
            console.error('Error exporting rules:', error);
            if (toast) {
                toast.error('Error al exportar reglas: ' + error.message);
            }
        }
    };

    // Import rules from JSON file
    const handleImportRules = async (file: File) => {
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const text = event.target?.result as string;
                    const importedRules = JSON.parse(text);

                    if (!Array.isArray(importedRules)) {
                        if (toast) {
                            toast.error('El archivo debe contener un array de reglas');
                        }
                        return;
                    }

                    // Use the import endpoint which handles media files automatically
                    try {
                        const response = await importAutoReplyRules(importedRules);
                        
                        if (response.success && response.imported > 0) {
                            // Reload rules to get the imported ones
                            const rulesResponse = await getAutoReplyRules();
                            if (rulesResponse.success) {
                                setRules(rulesResponse.rules);
                            }
                            
                            let message = `Se importaron ${response.imported} regla(s) exitosamente`;
                            if (response.failed > 0) {
                                message += `. ${response.failed} regla(s) no pudieron importarse.`;
                            }
                            if (response.errors && response.errors.length > 0) {
                                const errorPreview = response.errors.slice(0, 3).join('; ');
                                message += ` Errores: ${errorPreview}${response.errors.length > 3 ? '...' : ''}`;
                            }
                            
                            if (toast) {
                                toast.success(message);
                            }
                        } else {
                        if (toast) {
                                const errorMsg = response.errors && response.errors.length > 0
                                    ? response.errors.slice(0, 3).join('; ')
                                    : 'No se pudieron importar las reglas';
                                toast.error(errorMsg);
                        }
                        }
                    } catch (error: any) {
                        console.error('Error importing rules:', error);
                        if (toast) {
                            toast.error('Error al importar reglas: ' + (error.response?.data?.error || error.message));
                        }
                    }
                } catch (error: any) {
                    console.error('Error parsing imported file:', error);
                    if (toast) {
                        toast.error('Error al procesar el archivo: ' + error.message);
                    }
                }
            };
            reader.readAsText(file);
        } catch (error: any) {
            console.error('Error importing rules:', error);
            if (toast) {
                toast.error('Error al importar reglas: ' + error.message);
            }
        }
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            if (toast) {
                toast.error('Por favor selecciona un archivo JSON válido');
            }
            return;
        }

        handleImportRules(file);
        // Reset input
        if (importInputRef.current) {
            importInputRef.current.value = '';
        }
    };

    return (
        <>
        {/* Media Upload Progress Bar */}
        {media.uploadProgress && (
            <BulkProgressBar
                current={media.uploadProgress.current}
                total={media.uploadProgress.total}
                isActive={true}
                title="Subiendo archivos..."
                subtitle="Procesando archivos multimedia"
            />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">

            {/* Left Column: Rules List */}
            <div className="lg:col-span-1 flex flex-col gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="mb-4">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                            <Bot size={20} className="text-green-600" /> Reglas Activas
                        </h3>
                        <p className="text-xs text-slate-500 mt-2">
                            El bot responderá automáticamente cuando detecte estas palabras clave.
                        </p>
                    </div>
                    
                    {/* Export/Import buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleExportRules}
                            disabled={rules.length === 0}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            title="Exportar reglas a archivo JSON"
                        >
                            <Download size={16} />
                            Exportar
                        </button>
                        <button
                            onClick={() => importInputRef.current?.click()}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            title="Importar reglas desde archivo JSON"
                        >
                            <Upload size={16} />
                            Importar
                        </button>
                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleImportFile}
                            className="hidden"
                        />
                    </div>
                </div>

                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <span className="font-medium text-slate-700 text-sm">Lista de Reglas</span>
                        <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs">{rules.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {rules.length === 0 ? (
                            <div className="text-center p-8 text-slate-400 italic text-sm">
                                No hay reglas creadas.
                            </div>
                        ) : (
                            rules.map(rule => (
                                <div key={rule.id} className={`p-4 rounded-lg border transition-all ${editingId === rule.id ? 'border-green-500 bg-green-50' : rule.isActive ? 'border-slate-100 hover:border-green-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-slate-800 text-sm">{rule.name}</h4>
                                            {!rule.isActive && (
                                                <span className="px-2 py-0.5 text-xs font-medium bg-slate-200 text-slate-600 rounded-full">
                                                    Desactivada
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => toggleStatus(rule.id)} 
                                                className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                                                    rule.isActive 
                                                        ? "text-green-600 hover:bg-green-50 bg-green-50" 
                                                        : "text-slate-400 hover:bg-slate-100 bg-slate-50"
                                                }`}
                                                title={rule.isActive ? "Desactivar regla" : "Activar regla"}
                                            >
                                                {rule.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                                <span className="text-xs font-medium">
                                                    {rule.isActive ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </button>
                                            <button 
                                                onClick={() => handleEdit(rule)} 
                                                className="p-1.5 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                                title="Editar regla"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(rule.id)} 
                                                className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                title="Eliminar regla"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {(() => {
                                            // Normalize keywords to array (handle string or array)
                                            let keywordsArray: string[] = [];
                                            if (Array.isArray(rule.keywords)) {
                                                keywordsArray = rule.keywords;
                                            } else if (typeof rule.keywords === 'string') {
                                                try {
                                                    // Try to parse as JSON string
                                                    keywordsArray = JSON.parse(rule.keywords);
                                                } catch {
                                                    // If not JSON, split by comma
                                                    keywordsArray = rule.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
                                                }
                                            }
                                            return keywordsArray.map((k, i) => (
                                                <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                                    {k}
                                                </span>
                                            ));
                                        })()}
                                    </div>
                                    
                                    {/* Media Thumbnail */}
                                    {rule.mediaPath && (() => {
                                        const mediaType = getMediaTypeFromPath(rule.mediaPath);
                                        const previewUrl = getMediaPreviewUrl(rule.mediaPath);
                                        
                                        return (
                                            <div className="mb-2">
                                                <div className="relative w-full h-20 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 group hover:border-blue-300 transition-colors cursor-pointer">
                                                    {mediaType === 'image' ? (
                                                        <MediaThumbnail 
                                                            src={previewUrl}
                                                            type="image"
                                                            caption={rule.caption}
                                                        />
                                                    ) : mediaType === 'video' ? (
                                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
                                                            <div className="text-center">
                                                                <Video className="w-8 h-8 text-purple-500 mx-auto mb-1" />
                                                                <p className="text-xs text-slate-600 font-medium">Video</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                                                            <div className="text-center">
                                                                <FileText className="w-8 h-8 text-slate-500 mx-auto mb-1" />
                                                                <p className="text-xs text-slate-600 font-medium">Documento</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <div className="bg-black bg-opacity-50 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                                                            <Paperclip size={10} />
                                                            <span>Multimedia</span>
                                                        </div>
                                                    </div>
                                                    {rule.caption && mediaType !== 'image' && (
                                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                                            <p className="text-xs text-white line-clamp-1">{rule.caption}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    
                                    <p className="text-xs text-slate-500 line-clamp-2 italic border-l-2 border-slate-200 pl-2">
                                        "{rule.response}"
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Right Column: Editor */}
            <div className="lg:col-span-2">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                            {editingId ? <><Edit2 size={18} /> Editar Regla</> : <><Plus size={18} /> Nueva Regla</>}
                        </h3>
                        {editingId && (
                            <button onClick={resetForm} className="text-xs text-slate-500 flex items-center gap-1 hover:text-red-500">
                                <X size={14} /> Cancelar Edición
                            </button>
                        )}
                    </div>

                    {formErrors.general && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                            <p className="text-sm text-red-600">{formErrors.general}</p>
                        </div>
                    )}
                    
                    <div className="space-y-4 flex-1">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Regla</label>
                            <input
                                type="text"
                                className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500 ${
                                    formErrors.name ? 'border-red-300' : 'border-slate-300'
                                }`}
                                placeholder="Ej: Respuesta Saludo"
                                value={formData.name}
                                onChange={e => {
                                    setFormData({ ...formData, name: e.target.value });
                                    if (formErrors.name) setFormErrors({ ...formErrors, name: '' });
                                }}
                            />
                            {formErrors.name && (
                                <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Palabras Clave (Triggers)</label>
                            <input
                                type="text"
                                className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500 ${
                                    formErrors.keywords ? 'border-red-300' : 'border-slate-300'
                                }`}
                                placeholder="hola, buenos dias, info, precio (separadas por coma)"
                                value={keywordInput}
                                onChange={e => {
                                    setKeywordInput(e.target.value);
                                    if (formErrors.keywords) setFormErrors({ ...formErrors, keywords: '' });
                                }}
                            />
                            {formErrors.keywords ? (
                                <p className="mt-1 text-sm text-red-600">{formErrors.keywords}</p>
                            ) : (
                                <p className="text-xs text-slate-400 mt-1">El bot responderá si el mensaje recibido contiene alguna de estas palabras.</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Coincidencia</label>
                                <select
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500 bg-white"
                                    value={formData.matchType}
                                    onChange={e => setFormData({ ...formData, matchType: e.target.value as any })}
                                >
                                    <option value="contains">Contiene (Flexible)</option>
                                    <option value="exact">Exacta (Estricta)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                                    <Clock size={14} /> Retraso de Respuesta (seg)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="60"
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500"
                                    value={formData.delay}
                                    onChange={e => setFormData({ ...formData, delay: parseInt(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Mensaje de Respuesta</label>
                            {/* Message Editor Toolbar */}
                            <MessageEditorToolbar
                                textareaRef={messageTextareaRef}
                                value={formData.response || ''}
                                onChange={(value) => {
                                    setFormData({ ...formData, response: value });
                                    if (formErrors.response) setFormErrors({ ...formErrors, response: '' });
                                }}
                                showVariables={false}
                            />
                            <textarea
                                ref={messageTextareaRef}
                                className={`flex-1 w-full p-4 border rounded-lg resize-none mt-2 focus:ring-2 focus:ring-green-500 focus:border-transparent font-sans ${
                                    formErrors.response ? 'border-red-300' : 'border-slate-300'
                                }`}
                                placeholder="Escribe la respuesta automática aquí... (opcional si adjuntas multimedia)"
                                value={formData.response}
                                onChange={e => {
                                    setFormData({ ...formData, response: e.target.value });
                                    if (formErrors.response) setFormErrors({ ...formErrors, response: '' });
                                }}
                            ></textarea>
                            {formErrors.response && (
                                <p className="mt-1 text-sm text-red-600">{formErrors.response}</p>
                            )}
                            
                            {/* Inline Preview */}
                            {formData.response && (
                                <div className="mt-4">
                                    <MessagePreview 
                                        message={formData.response}
                                        contactName="Usuario"
                                        inline={true}
                                        showContactInfo={false}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Media Upload */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Archivo Multimedia (opcional)
                            </label>
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
                            <p className="text-xs text-slate-400 mt-2">
                                Si adjuntas un archivo, el mensaje de texto se enviará por separado después del archivo.
                            </p>
                        </div>
                    </div>

                    <div className="pt-6 mt-4 border-t border-slate-100 flex justify-end">
                        <button
                            onClick={handleSave}
                            className="bg-slate-900 text-white px-8 py-3 rounded-lg font-medium hover:bg-slate-800 flex items-center gap-2 shadow-lg"
                        >
                            <Save size={18} /> {editingId ? 'Actualizar Regla' : 'Guardar Regla'}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {/* Delete Confirmation Modal */}
        <ConfirmModal
            isOpen={showDeleteModal}
            onClose={() => {
                setShowDeleteModal(false);
                setRuleToDelete(null);
            }}
            onConfirm={confirmDelete}
            title="Eliminar Regla"
            message={ruleToDelete ? `¿Estás seguro de que deseas eliminar la regla "${rules.find(r => r.id === ruleToDelete)?.name || 'esta regla'}"? Esta acción no se puede deshacer.` : ''}
            confirmText="Eliminar"
            cancelText="Cancelar"
            type="danger"
        />
        </>
    );
};