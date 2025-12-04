import React, { useState } from 'react';
import { Clock, Calendar } from 'lucide-react';
import { ScheduleType } from '../types';

interface SchedulePickerProps {
  onScheduleChange: (type: ScheduleType, delayMinutes?: number, scheduledAt?: Date) => void;
  disabled?: boolean;
}

export const SchedulePicker: React.FC<SchedulePickerProps> = ({ onScheduleChange, disabled = false }) => {
  const [scheduleType, setScheduleType] = useState<ScheduleType>('now');
  const [delayMinutes, setDelayMinutes] = useState(5);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  const handleTypeChange = (type: ScheduleType) => {
    setScheduleType(type);
    if (type === 'now') {
      onScheduleChange('now');
    }
  };

  const handleDelayChange = (minutes: number) => {
    setDelayMinutes(minutes);
    onScheduleChange('delay', minutes);
  };

  const handleDateTimeChange = () => {
    if (scheduledDate && scheduledTime) {
      // Parse time components directly from the time input
      // time input format is always HH:mm (24-hour)
      const [hours, minutes] = scheduledTime.split(':').map(Number);
      
      if (isNaN(hours) || isNaN(minutes)) {
        return;
      }
      
      // Parse date components
      const [year, month, day] = scheduledDate.split('-').map(Number);
      
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return;
      }
      
      // Create date object using local time components
      // This ensures the date is created in the user's local timezone
      const scheduledAt = new Date(year, month - 1, day, hours, minutes, 0, 0);
      
      // Validate that the date is valid
      if (isNaN(scheduledAt.getTime())) {
        return;
      }
      
      // No validation here - just update the date
      // Backend will handle all validation
      onScheduleChange('datetime', undefined, scheduledAt);
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    return now.toISOString().slice(0, 16);
  };

  const getMinTime = () => {
    const now = new Date();
    const selectedDate = scheduledDate ? new Date(scheduledDate) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // If selected date is today, min time should be current time + 1 minute
    if (selectedDate && selectedDate.toDateString() === today.toDateString()) {
      const minTime = new Date();
      minTime.setMinutes(minTime.getMinutes() + 1);
      return minTime.toTimeString().slice(0, 5);
    }
    
    return '00:00';
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <Clock size={18} /> Programación de Envío
      </h3>

      <div className="space-y-4">
        {/* Schedule Type Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">¿Cuándo enviar?</label>
          <div className="grid grid-cols-3 gap-2">
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
                value={delayMinutes}
                onChange={(e) => handleDelayChange(parseInt(e.target.value))}
                disabled={disabled}
                className="flex-1"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={delayMinutes}
                  onChange={(e) => handleDelayChange(parseInt(e.target.value))}
                  disabled={disabled}
                  className="w-20 px-2 py-1 border border-slate-200 rounded text-center"
                />
                <span className="text-sm text-slate-600">minutos</span>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              {delayMinutes < 60
                ? `En ${delayMinutes} minutos`
                : delayMinutes === 60
                ? 'En 1 hora'
                : `En ${Math.floor(delayMinutes / 60)} horas y ${delayMinutes % 60} minutos`}
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
                onChange={(e) => {
                  setScheduledDate(e.target.value);
                  handleDateTimeChange();
                }}
                min={new Date().toISOString().split('T')[0]}
                disabled={disabled}
                className="px-3 py-2 border border-slate-200 rounded-lg"
              />
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => {
                  setScheduledTime(e.target.value);
                  handleDateTimeChange();
                }}
                min={getMinTime()}
                disabled={disabled}
                className="px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            {scheduledDate && scheduledTime && (() => {
              // Reconstruct date the same way as handleDateTimeChange
              const [hours, minutes] = scheduledTime.split(':').map(Number);
              const [year, month, day] = scheduledDate.split('-').map(Number);
              const selectedDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
              
              // Show timezone info (no validation, just display)
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
            {scheduleType === 'delay' && `Los mensajes se enviarán en ${delayMinutes} minutos.`}
            {scheduleType === 'datetime' && (scheduledDate && scheduledTime
              ? `Los mensajes se enviarán el ${new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}.`
              : 'Selecciona fecha y hora para programar el envío.')}
          </div>
        </div>
      </div>
    </div>
  );
};
