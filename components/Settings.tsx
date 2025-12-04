import React, { useState } from 'react';
import { Save, Monitor, Clock, Users, Timer } from 'lucide-react';
import { AppConfig } from '../types';
import { updateConfig as updateConfigApi } from '../services/api';

interface SettingsProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  toast?: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
}

export const Settings: React.FC<SettingsProps> = ({ config, setConfig, toast }) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    const { messageDelay, maxContactsPerBatch, waitTimeBetweenBatches, headless, defaultCountryCode } = localConfig;

    if (!messageDelay || messageDelay <= 0) {
      toast?.error('El retraso entre mensajes debe ser un número mayor a 0.');
      setSaveStatus('error');
      return;
    }

    if (!maxContactsPerBatch || maxContactsPerBatch <= 0) {
      toast?.error('El máximo de contactos por lote debe ser un número mayor a 0.');
      setSaveStatus('error');
      return;
    }

    if (waitTimeBetweenBatches === undefined || waitTimeBetweenBatches < 0) {
      toast?.error('El tiempo de espera entre lotes debe ser un número igual o mayor a 0.');
      setSaveStatus('error');
      return;
    }

    const normalizedConfig: AppConfig = {
      headless,
      messageDelay,
      maxContactsPerBatch,
      waitTimeBetweenBatches,
      defaultCountryCode: (defaultCountryCode || '').trim()
    };

    try {
      const response = await updateConfigApi(normalizedConfig);
      if (!response?.success) {
        throw new Error('No se pudo guardar la configuración');
      }
      const savedConfig = response.config || normalizedConfig;
      setConfig(savedConfig);
      setLocalConfig(savedConfig);
      setSaveStatus('success');
      toast?.success('¡Configuración guardada exitosamente!');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: any) {
      console.error('Error saving config:', err);
      setSaveStatus('error');
      toast?.error(err?.message || 'No se pudo guardar la configuración');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {saveStatus === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-600">¡Configuración guardada exitosamente!</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Configuración del Navegador */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Monitor size={20} className="text-blue-500" /> Configuración del Navegador
          </h3>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-3">
                <Monitor size={20} className="text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Modo Headless (Sin ventana)</p>
                  <p className="text-xs text-slate-500">Ejecutar navegador en segundo plano</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.headless}
                  onChange={(e) => setLocalConfig({ ...localConfig, headless: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Envío individual */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Users size={20} className="text-green-500" /> Envío Individual
          </h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Código de país por defecto (envío individual)
            </label>
            <input
              type="text"
              placeholder="Ej: +51, +54, +1"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
              value={localConfig.defaultCountryCode || ''}
              onChange={(e) => setLocalConfig({ ...localConfig, defaultCountryCode: e.target.value })}
            />
            <p className="text-xs text-slate-500 mt-2">
              Este código se usará solo en el formulario de envío individual como valor por defecto para el país.
            </p>
          </div>
        </div>

        {/* Rendimiento y seguridad */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Clock size={20} className="text-orange-500" /> Rendimiento y Seguridad
          </h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Retraso entre Mensajes (segundos)</label>
            <input
              type="number"
              value={localConfig.messageDelay ?? ''}
              onChange={(e) => {
                const value = e.target.value === '' ? undefined : Number(e.target.value);
                setLocalConfig({ ...localConfig, messageDelay: value });
              }}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500"
            />
            <p className="text-xs text-slate-500 mt-2">
              Tiempo aleatorio entre mensajes (entre 1 y este valor en segundos) para evitar baneos de WhatsApp. Recomendado: 2-5 segundos.
            </p>
          </div>
        </div>

        {/* Límites de envío masivo */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Users size={20} className="text-purple-500" /> Límites de Envío Masivo
          </h3>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Máximo de Contactos por Lote
              </label>
              <input
                type="number"
                value={localConfig.maxContactsPerBatch ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : Number(e.target.value);
                  setLocalConfig({ ...localConfig, maxContactsPerBatch: value });
                }}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500"
              />
              <p className="text-xs text-slate-500 mt-2">
                Número máximo de contactos que se enviarán en cada lote antes de esperar.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <Timer size={16} className="text-slate-500" />
                Tiempo de Espera entre Lotes (minutos)
              </label>
              <input
                type="number"
                value={localConfig.waitTimeBetweenBatches ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : Number(e.target.value);
                  setLocalConfig({ ...localConfig, waitTimeBetweenBatches: value });
                }}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-green-500 focus:border-green-500"
              />
              <p className="text-xs text-slate-500 mt-2">
                Tiempo de espera en minutos entre cada lote de envíos. Ejemplo: Si tienes 1000 contactos, máximo 50 por lote y 15 minutos de espera, enviará 50, esperará 15 minutos, enviará otros 50, y así sucesivamente.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="bg-slate-900 text-white px-8 py-3 rounded-lg font-medium hover:bg-slate-800 flex items-center gap-2 shadow-lg"
        >
          <Save size={18} /> Guardar Configuración
        </button>
      </div>
    </div>
  );
}
;