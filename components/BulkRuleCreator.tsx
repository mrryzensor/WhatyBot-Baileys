import React, { useState, useRef, useEffect } from 'react';
import { X, Globe, ChevronDown, ChevronUp, Zap, CheckSquare, Square, Loader, AlertTriangle, Image as ImageIcon, Trash2 } from 'lucide-react';
import { countries as countryList } from '../utils/countries';
import { createAutoReplyRule } from '../services/api';
import { AutoReplyRule } from '../types';
import { useMedia } from '../hooks/useMedia';
import { MediaUpload } from './MediaUpload';
import { MessageEditorToolbar } from './MessageEditorToolbar';
import { MessagePreview } from './MessagePreview';

interface CountryImage {
    countryCode: string;
    file: File | null;
    preview: string | null;
}

interface BulkRuleCreatorProps {
    isOpen: boolean;
    onClose: () => void;
    onRulesCreated: (newRules: AutoReplyRule[]) => void;
    toast?: {
        success: (msg: string) => void;
        error: (msg: string) => void;
        warning: (msg: string) => void;
        info: (msg: string) => void;
    };
}

export const BulkRuleCreator: React.FC<BulkRuleCreatorProps> = ({ isOpen, onClose, onRulesCreated, toast }) => {
    // Shared fields
    const [baseRuleName, setBaseRuleName] = useState('');
    const [keywords, setKeywords] = useState('');
    const [matchType, setMatchType] = useState<'contains' | 'exact'>('contains');
    const [delay, setDelay] = useState(2);
    const [sharedResponse, setSharedResponse] = useState('');

    // Shared media
    const media = useMedia({ maxFiles: 10 });
    const messageTextareaRef = useRef<HTMLTextAreaElement>(null);

    const [allowUnknownCountries, setAllowUnknownCountries] = useState(false);
    const [isMessageCaption, setIsMessageCaption] = useState(false);

    // Variables allowed in the editor
    const bulkVariables = ['nombre', 'pais'];

    // Country selection
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [countrySearch, setCountrySearch] = useState('');
    const [showCountrySelector, setShowCountrySelector] = useState(false);

    // Per-country images
    const [countryImages, setCountryImages] = useState<Record<string, CountryImage>>({});
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    // Progress
    const [isCreating, setIsCreating] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, errors: [] as string[] });

    const filteredCountries = countryList.filter(c =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.code.includes(countrySearch.replace('+', ''))
    );

    const toggleCountry = (code: string) => {
        setSelectedCountries(prev => {
            if (prev.includes(code)) {
                const next = prev.filter(c => c !== code);
                setCountryImages(imgs => {
                    const copy = { ...imgs };
                    if (copy[code]?.preview) URL.revokeObjectURL(copy[code].preview!);
                    delete copy[code];
                    return copy;
                });
                return next;
            }
            return [...prev, code];
        });
    };

    const selectAll = () => {
        const codes = filteredCountries.map(c => c.code);
        const allSelected = codes.every(c => selectedCountries.includes(c));
        if (allSelected) {
            setSelectedCountries(prev => prev.filter(c => !codes.includes(c)));
        } else {
            setSelectedCountries(prev => Array.from(new Set([...prev, ...codes])));
        }
    };

    const handleImageSelect = (countryCode: string, file: File) => {
        const preview = URL.createObjectURL(file);
        setCountryImages(prev => ({ ...prev, [countryCode]: { countryCode, file, preview } }));
    };

    const removeImage = (countryCode: string) => {
        setCountryImages(prev => {
            const copy = { ...prev };
            if (copy[countryCode]?.preview) URL.revokeObjectURL(copy[countryCode].preview!);
            delete copy[countryCode];
            return copy;
        });
    };

    const reset = () => {
        setBaseRuleName('');
        setKeywords('');
        setMatchType('contains');
        setDelay(2);
        setSharedResponse('');
        media.clearAll();
        setSelectedCountries([]);
        setCountryImages({});
        setCountrySearch('');
        setProgress({ current: 0, total: 0, errors: [] });
        setAllowUnknownCountries(false);
        setIsMessageCaption(false);
    };

    // Close and reset logic
    const handleClose = () => {
        if (!isCreating) {
            reset();
            onClose();
        }
    };

    // Auto-resize message response textarea
    React.useEffect(() => {
        const textarea = messageTextareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [sharedResponse]);

    const handleCreate = async () => {
        // Validations
        if (!baseRuleName.trim()) { toast?.error('El nombre base es requerido'); return; }
        if (!keywords.trim()) { toast?.error('Debes ingresar al menos una palabra clave'); return; }
        if (selectedCountries.length === 0) { toast?.error('Selecciona al menos un país'); return; }
        
        const hasAnyMedia = media.mediaItems.length > 0;
        const hasPerCountryImage = (Object.values(countryImages) as CountryImage[]).some(img => img.file);
        
        if (!sharedResponse.trim() && !hasAnyMedia && !hasPerCountryImage) {
            toast?.error('Debes ingresar una respuesta de texto o adjuntar una imagen compartida'); return;
        }

        setIsCreating(true);
        setProgress({ current: 0, total: selectedCountries.length, errors: [] });

        const createdRules: AutoReplyRule[] = [];
        const errors: string[] = [];

        // Pre-extract files and captions from shared media
        const sharedFiles = media.mediaItems.map(m => m.file).filter(Boolean) as File[];
        const sharedCaptionsBase = media.mediaItems.map(m => m.caption);

        for (let i = 0; i < selectedCountries.length; i++) {
            const code = selectedCountries[i];
            const country = countryList.find(c => c.code === code);
            const countryName = country?.name || code;

            // Replace wildcards in keywords/triggers for this country
            const countryKeywords = keywords
                .split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0)
                .map(k => k
                    .replace(/\{\{país\}\}/gi, countryName)
                    .replace(/\{\{pais\}\}/gi, countryName)
                    .replace(/\[país\]/gi, countryName)
                    .replace(/\[pais\]/gi, countryName)
                );

            // Replace wildcards in response
            const responseText = sharedResponse
                .replace(/\{\{país\}\}/gi, countryName)
                .replace(/\{\{pais\}\}/gi, countryName)
                .replace(/\[país\]/gi, countryName)
                .replace(/\[pais\]/gi, countryName);
            
            // Reemplazamos [nombre] por {{nombre}} asumiendo que el bot usa {{nombre}}, o lo dejamos como [nombre] si el usuario lo prefiere así. El toolbar inserta {{nombre}}.
            
            // Replace wildcards in captions
            const captions = sharedCaptionsBase.map(cap => 
                cap.replace(/\{\{país\}\}/gi, countryName)
                   .replace(/\{\{pais\}\}/gi, countryName)
                   .replace(/\[país\]/gi, countryName)
                   .replace(/\[pais\]/gi, countryName)
            );

            // Determine if this country has an override image
            const specificImage = countryImages[code]?.file ?? null;
            
            let filesToSend: File[] = [];
            let captionsToSend: string[] = [];

            if (specificImage) {
                // If there's a specific image, we use IT as the FIRST media item
                filesToSend = [specificImage, ...sharedFiles.slice(1)];
                captionsToSend = [
                    isMessageCaption ? responseText : (captions[0] || ''),
                    ...captions.slice(1)
                ];
            } else {
                filesToSend = [...sharedFiles];
                captionsToSend = [
                    isMessageCaption ? responseText : (captions[0] || ''),
                    ...captions.slice(1)
                ];
            }

            const ruleData = {
                name: `${baseRuleName.trim()} ${countryName}`,
                keywords: countryKeywords,
                response: isMessageCaption && filesToSend.length > 0 ? '' : responseText,
                matchType,
                delay,
                isActive: true,
                caption: captionsToSend[0] || '',
                captions: captionsToSend,
                type: 'simple',
                countries: [code],
                excludeCountries: [],
                allowUnknownCountries: allowUnknownCountries
            };

            try {
                const response = await createAutoReplyRule(ruleData, filesToSend, captionsToSend);
                if (response.success) {
                    createdRules.push(response.rule);
                } else {
                    errors.push(`${countryName}: Error al crear`);
                }
            } catch (err: any) {
                errors.push(`${countryName}: ${err.message}`);
            }

            setProgress({ current: i + 1, total: selectedCountries.length, errors });
        }

        setIsCreating(false);

        if (createdRules.length > 0) {
            onRulesCreated(createdRules);
            toast?.success(`✅ Se crearon ${createdRules.length} regla(s) exitosamente${errors.length > 0 ? ` (${errors.length} fallaron)` : ''}`);
        }
        if (errors.length > 0 && createdRules.length === 0) {
            toast?.error(`No se pudo crear ninguna regla. Revisa los errores.`);
        }

        if (createdRules.length > 0) {
            reset();
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-theme-card rounded-2xl shadow-2xl border border-theme w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-theme bg-gradient-to-r from-primary-600/10 to-blue-600/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-600 rounded-xl">
                            <Zap size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-theme-main">Creación Masiva de Reglas</h2>
                            <p className="text-xs text-theme-muted">Crea reglas idénticas para múltiples países con comodines</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-theme rounded-lg transition-colors">
                        <X size={20} className="text-theme-muted" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-6 space-y-8">

                        {/* Section 1: Shared base fields */}
                        <section>
                            <h3 className="text-sm font-semibold text-theme-main mb-4 flex items-center gap-2">
                                <span className="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">1</span>
                                Campos Base
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                                <div>
                                    <label className="block text-xs font-medium text-theme-main mb-1.5">
                                        Nombre Base <span className="text-theme-muted font-normal">(se añadirá el país)</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full border border-theme rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-theme-base transition-all"
                                        placeholder="Ej: Inscribirme"
                                        value={baseRuleName}
                                        onChange={e => setBaseRuleName(e.target.value)}
                                    />
                                    {baseRuleName && (
                                        <p className="text-[11px] text-theme-muted mt-1.5 flex items-center gap-1">
                                            <span>Ejemplo:</span>
                                            <span className="font-semibold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">"{baseRuleName} Perú"</span>
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-theme-main mb-1.5">Palabras Clave (separadas por coma)</label>
                                    <input
                                        type="text"
                                        className="w-full border border-theme rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-theme-base transition-all"
                                        placeholder="inscribirme, info precio, comprar"
                                        value={keywords}
                                        onChange={e => setKeywords(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-theme-main mb-1.5">Tipo de Coincidencia</label>
                                    <select
                                        className="w-full border border-theme rounded-lg px-3 py-2.5 text-sm bg-theme-base focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                                        value={matchType}
                                        onChange={e => setMatchType(e.target.value as any)}
                                    >
                                        <option value="contains">Contiene (Flexible)</option>
                                        <option value="exact">Exacta (Estricta)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-theme-main mb-1.5">Retraso de Respuesta (seg)</label>
                                    <input
                                        type="number" min="0" max="60"
                                        className="w-full border border-theme rounded-lg px-3 py-2.5 text-sm bg-theme-base focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                                        value={delay}
                                        onChange={e => setDelay(parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-theme-main mb-1.5 font-semibold text-primary-700">
                                        Destino del Mensaje Principal (Texto)
                                    </label>
                                    <select
                                        className="w-full border border-theme rounded-lg px-3 py-2.5 text-sm bg-theme-base focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium text-theme-main"
                                        value={isMessageCaption ? 'caption' : 'text'}
                                        onChange={e => setIsMessageCaption(e.target.value === 'caption')}
                                    >
                                        <option value="text">Enviar como Mensaje de Texto Independiente</option>
                                        <option value="caption">Enviar como Caption (Subtítulo) de Imagen</option>
                                    </select>
                                </div>
                                <div className="flex items-center pt-5">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs group">
                                        <input
                                            type="checkbox"
                                            checked={allowUnknownCountries}
                                            onChange={(e) => setAllowUnknownCountries(e.target.checked)}
                                            className="h-4 w-4 text-primary-600 rounded border-theme focus:ring-primary-500 bg-theme-base"
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-theme-muted group-hover:text-theme-main transition-colors font-medium">
                                                Permitir si el país no es detectable (LID desconocido)
                                            </span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-4 bg-theme-base border border-theme p-4 rounded-xl">
                                <div>
                                    <label className="block text-sm font-semibold text-theme-main mb-2">Mensaje Principal (Texto)</label>
                                    <MessageEditorToolbar
                                        textareaRef={messageTextareaRef}
                                        value={sharedResponse}
                                        onChange={setSharedResponse}
                                        variables={bulkVariables}
                                        showVariables={true}
                                        showEmojiPickerBelow={true}
                                    />
                                    <textarea
                                        ref={messageTextareaRef}
                                        className="w-full border border-theme border-t-0 rounded-b-lg px-3 py-3 text-sm font-sans resize-none overflow-y-auto min-h-[100px] max-h-[400px] focus:ring-0 focus:outline-none focus:border-primary-500 bg-theme-card transition-colors"
                                        placeholder="Ej: Hola {{nombre}}, aquí tienes los precios para {{pais}}..."
                                        value={sharedResponse}
                                        onChange={e => setSharedResponse(e.target.value)}
                                    />
                                    <div className="flex justify-between items-center mt-2">
                                        <p className="text-[11px] text-theme-muted">
                                            Usa <code className="bg-slate-100 text-slate-700 px-1 py-0.5 rounded">{'{{nombre}}'}</code> y <code className="bg-slate-100 text-slate-700 px-1 py-0.5 rounded">{'{{pais}}'}</code> como comodines.
                                        </p>
                                    </div>
                                </div>

                                {/* Shared media upload with captions */}
                                <div className="pt-4 border-t border-theme">
                                    <label className="block text-sm font-semibold text-theme-main mb-2 flex items-center justify-between">
                                        <span>Multimedia Base (Fotos/Videos/Docs)</span>
                                    </label>
                                    <MediaUpload
                                        mediaItems={media.mediaItems}
                                        onMediaChange={media.setMediaItems}
                                        maxFiles={media.maxFiles}
                                        variables={bulkVariables}
                                        fileInputRef={media.fileInputRef}
                                        onFileSelect={media.handleFileSelect}
                                        onDrop={media.handleDrop}
                                        onOpenFileSelector={media.openFileSelector}
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Section 2: Country selector */}
                        <section>
                            <h3 className="text-sm font-semibold text-theme-main mb-4 flex items-center gap-2">
                                <span className="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">2</span>
                                Selecciona los Países
                                {selectedCountries.length > 0 && (
                                    <span className="ml-auto text-xs bg-primary-600 text-white px-2.5 py-1 rounded-full font-medium shadow-sm">
                                        {selectedCountries.length} seleccionado(s)
                                    </span>
                                )}
                            </h3>

                            <div className="border border-theme rounded-xl overflow-hidden shadow-sm">
                                <button
                                    onClick={() => setShowCountrySelector(v => !v)}
                                    className="flex items-center justify-between w-full p-3.5 bg-theme-base text-sm font-semibold text-theme-main hover:bg-theme transition-colors"
                                >
                                    <span className="flex items-center gap-2">
                                        <Globe size={16} className="text-primary-600" />
                                        {showCountrySelector ? 'Ocultar selector de países' : 'Mostrar selector de países'}
                                    </span>
                                    {showCountrySelector ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>

                                {showCountrySelector && (
                                    <div className="p-4 space-y-4 bg-theme-card">
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar país o código..."
                                                    className="w-full pl-9 pr-3 py-2 text-sm border border-theme rounded-lg bg-theme-base focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                                                    value={countrySearch}
                                                    onChange={e => setCountrySearch(e.target.value)}
                                                />
                                            </div>
                                            <button
                                                onClick={selectAll}
                                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-theme rounded-lg hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition-all text-theme-muted bg-theme-base"
                                            >
                                                {filteredCountries.every(c => selectedCountries.includes(c.code))
                                                    ? <><Square size={14} /> Desmarcar Todo</>
                                                    : <><CheckSquare size={14} /> Marcar Todo</>
                                                }
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                            {filteredCountries.map(country => {
                                                const isSelected = selectedCountries.includes(country.code);
                                                return (
                                                    <label
                                                        key={`${country.iso}-${country.code}`}
                                                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all text-xs font-medium select-none ${isSelected
                                                            ? 'bg-primary-50 border-primary-300 text-primary-800 shadow-sm'
                                                            : 'border-transparent hover:bg-theme-base text-theme-muted'
                                                            }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="text-primary-600 rounded border-slate-300 focus:ring-primary-500"
                                                            checked={isSelected}
                                                            onChange={() => toggleCountry(country.code)}
                                                        />
                                                        {country.iso && (
                                                            <img src={`https://flagcdn.com/w20/${country.iso.toLowerCase()}.png`} width="16" alt="" className="rounded-sm shrink-0 shadow-sm" />
                                                        )}
                                                        <span className="truncate">{country.name}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>

                                        {/* Selected pills */}
                                        {selectedCountries.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-3 border-t border-theme">
                                                {selectedCountries.map(code => {
                                                    const c = countryList.find(x => x.code === code);
                                                    return (
                                                        <span key={code} className="flex items-center gap-1.5 bg-theme-base text-theme-main text-[11px] px-2.5 py-1 rounded-full border border-theme font-medium shadow-sm group hover:border-red-200 hover:bg-red-50 transition-colors">
                                                            {c?.iso && <img src={`https://flagcdn.com/w20/${c.iso.toLowerCase()}.png`} width="12" alt="" className="rounded-xs shadow-sm" />}
                                                            {c?.name || code}
                                                            <button onClick={() => toggleCountry(code)} className="text-theme-muted group-hover:text-red-500 transition-colors ml-0.5"><X size={12} /></button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Section 3: Per-country images */}
                        {selectedCountries.length > 0 && (
                            <section>
                                <h3 className="text-sm font-semibold text-theme-main mb-4 flex items-center gap-2">
                                    <span className="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">3</span>
                                    Imágenes Específicas por País
                                    <span className="text-xs font-normal text-theme-muted">(opcional)</span>
                                </h3>

                                <div className="mb-4 flex items-start gap-3 bg-blue-50/50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
                                    <ImageIcon size={16} className="shrink-0 mt-0.5 text-blue-600" />
                                    <span>
                                        Si no subes una imagen aquí, el país utilizará la <strong>Multimedia Base</strong> cargada en el paso 1 (con su respectivo caption). 
                                        Si subes una imagen específica, esta reemplazará a la primera imagen base, pero mantendrá el caption.
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {selectedCountries.map(code => {
                                        const country = countryList.find(c => c.code === code);
                                        const img = countryImages[code];

                                        return (
                                            <div
                                                key={code}
                                                className={`border rounded-xl p-3 space-y-2.5 transition-all ${img?.file ? 'border-primary-300 bg-primary-50/30 shadow-sm' : 'border-theme bg-theme-base hover:border-slate-300'}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {country?.iso && (
                                                        <img src={`https://flagcdn.com/w20/${country.iso.toLowerCase()}.png`} width="18" alt="" className="rounded-sm shadow-sm" />
                                                    )}
                                                    <span className="text-xs font-semibold text-theme-main">{country?.name || code}</span>
                                                    {!img?.file && media.mediaItems.length > 0 && (
                                                        <span className="ml-auto text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">Usa Base</span>
                                                    )}
                                                </div>

                                                {img?.preview ? (
                                                    <div className="relative group rounded-lg overflow-hidden border border-theme shadow-sm">
                                                        <img src={img.preview} alt="preview" className="w-full h-24 object-cover" />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <button
                                                                onClick={() => removeImage(code)}
                                                                className="bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition-transform transform hover:scale-110 shadow-lg"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                                                            <p className="text-[10px] text-white/90 truncate">{img.file?.name}</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => fileInputRefs.current[code]?.click()}
                                                        className="w-full h-24 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-1.5 hover:border-primary-400 hover:bg-primary-50/50 transition-all text-slate-400 hover:text-primary-600"
                                                    >
                                                        <div className="p-1.5 bg-slate-100 rounded-full group-hover:bg-primary-100 transition-colors">
                                                            <ImageIcon size={16} />
                                                        </div>
                                                        <span className="text-[10px] font-medium">Subir específica</span>
                                                    </button>
                                                )}

                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    ref={el => { fileInputRefs.current[code] = el; }}
                                                    onChange={e => {
                                                        const file = e.target.files?.[0];
                                                        if (file) handleImageSelect(code, file);
                                                        e.target.value = '';
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* Progress */}
                        {isCreating && (
                            <div className="border border-primary-200 bg-primary-50 rounded-xl p-5 shadow-inner">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-1.5 bg-primary-100 rounded-full">
                                        <Loader size={18} className="animate-spin text-primary-600" />
                                    </div>
                                    <span className="text-sm font-semibold text-primary-800">
                                        Creando reglas... ({progress.current} de {progress.total})
                                    </span>
                                </div>
                                <div className="w-full bg-primary-200/50 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className="bg-primary-600 h-full rounded-full transition-all duration-300 ease-out"
                                        style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                                    />
                                </div>
                                {progress.errors.length > 0 && (
                                    <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg space-y-1">
                                        {progress.errors.map((err, i) => (
                                            <p key={i} className="text-[11px] text-red-600 flex items-center gap-1.5 font-medium">
                                                <AlertTriangle size={12} /> {err}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-theme flex flex-col sm:flex-row items-center justify-between gap-4 bg-theme-base shrink-0">
                    <div className="text-sm text-theme-muted font-medium">
                        {selectedCountries.length > 0
                            ? <>Se crearán <strong className="text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md">{selectedCountries.length} regla(s)</strong></>
                            : 'Selecciona países para continuar'
                        }
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button
                            onClick={handleClose}
                            disabled={isCreating}
                            className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-semibold border border-theme rounded-xl hover:bg-slate-100 text-theme-main transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={isCreating || selectedCountries.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-primary-600 to-blue-600 text-white text-sm font-bold rounded-xl hover:from-primary-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                        >
                            {isCreating ? (
                                <><Loader size={16} className="animate-spin" /> Creando...</>
                            ) : (
                                <><Zap size={16} className="fill-current" /> Crear Reglas</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
