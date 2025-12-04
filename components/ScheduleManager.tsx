import React from 'react';
import { Clock, Calendar } from 'lucide-react';
import { ScheduleType } from '../types';
import { useSchedule } from '../hooks/useSchedule';

interface ScheduleManagerProps {
  scheduleType: ScheduleType;
  delayMinutes?: number;
  scheduledAt?: Date;
  scheduledDate: string;
  scheduledTime: string;
  onScheduleChange: (type: ScheduleType, delay?: number, scheduledAt?: Date) => void;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  disabled?: boolean;
}

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  scheduleType,
  delayMinutes,
  scheduledAt,
  scheduledDate,
  scheduledTime,
  onScheduleChange,
  onDateChange,
  onTimeChange,
  disabled = false
}) => {
  const getMinTime = () => {
    const today = new Date().toISOString().split('T')[0];
    if (scheduledDate === today) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes() + 1).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return '';
  };

  const handleTypeChange = (type: ScheduleType) => {
    onScheduleChange(type);
  };

  const handleDelayChange = (minutes: number) => {
    onScheduleChange('delay', minutes);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onDateChange(e.target.value);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onTimeChange(e.target.value);
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-slate-700">
        Programar Envío
      </label>

      {/* Schedule Type Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => handleTypeChange('now')}
          disabled={disabled}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            scheduleType === 'now'
              ? 'bg-green-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Ahora
        </button>
        <button
          onClick={() => handleTypeChange('delay')}
          disabled={disabled}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            scheduleType === 'delay'
              ? 'bg-green-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          En X minutos
        </button>
        <button
          onClick={() => handleTypeChange('datetime')}
          disabled={disabled}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            scheduleType === 'datetime'
              ? 'bg-green-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Fecha y hora
        </button>
      </div>

      {/* Delay Options */}
      {scheduleType === 'delay' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Minutos de espera</label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="1"
              max="1440"
              value={delayMinutes || 1}
              onChange={(e) => handleDelayChange(parseInt(e.target.value))}
              disabled={disabled}
              className="flex-1"
            />
            <input
              type="number"
              min="1"
              max="1440"
              value={delayMinutes || 1}
              onChange={(e) => handleDelayChange(Math.max(1, Math.min(1440, parseInt(e.target.value) || 1)))}
              disabled={disabled}
              className="w-20 px-3 py-2 border border-slate-200 rounded-lg"
            />
            <span className="text-sm text-slate-500">minutos</span>
          </div>
        </div>
      )}

      {/* DateTime Options */}
      {scheduleType === 'datetime' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Calendar size={16} /> Fecha y hora exacta
          </label>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              value={scheduledDate}
              onChange={handleDateChange}
              min={new Date().toISOString().split('T')[0]}
              disabled={disabled}
              className="px-3 py-2 border border-slate-200 rounded-lg"
            />
            <input
              type="time"
              value={scheduledTime}
              onChange={handleTimeChange}
              min={getMinTime()}
              disabled={disabled}
              className="px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>
          {scheduledDate && scheduledTime && (() => {
            const [hours, minutes] = scheduledTime.split(':').map(Number);
            const [year, month, day] = scheduledDate.split('-').map(Number);
            const selectedDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
            
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const timezoneOffset = -selectedDate.getTimezoneOffset() / 60;
            const offsetStr = timezoneOffset >= 0 ? `UTC+${timezoneOffset}` : `UTC${timezoneOffset}`;
            
            return (
              <div className="text-xs flex flex-col gap-1 text-slate-500">
                <div className="flex items-center gap-2">
                  <Calendar size={12} />
                  <span>
                    Programado para: {selectedDate.toLocaleString('es-ES', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })} ({offsetStr})
                  </span>
                </div>
                <div className="text-xs text-slate-400 ml-4">
                  Se enviará a: {selectedDate.toISOString()} (UTC)
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Info Messages */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="text-sm text-blue-800">
          {scheduleType === 'now' && 'Los mensajes se enviarán inmediatamente.'}
          {scheduleType === 'delay' && `Los mensajes se enviarán en ${delayMinutes || 1} minutos.`}
          {scheduleType === 'datetime' && (scheduledDate && scheduledTime
            ? (() => {
                const [hours, minutes] = scheduledTime.split(':').map(Number);
                const [year, month, day] = scheduledDate.split('-').map(Number);
                const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
                return `Los mensajes se enviarán el ${date.toLocaleString('es-ES', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                })}.`;
              })()
            : 'Selecciona fecha y hora para programar el envío.')}
        </div>
      </div>
    </div>
  );
};

