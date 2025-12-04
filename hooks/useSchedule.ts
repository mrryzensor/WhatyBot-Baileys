import { useState } from 'react';
import { ScheduleType } from '../types';

export interface ScheduleState {
  scheduleType: ScheduleType;
  delayMinutes?: number;
  scheduledAt?: Date;
}

export interface UseScheduleOptions {
  onScheduleChange?: (state: ScheduleState) => void;
  initialType?: ScheduleType;
}

export const useSchedule = (options: UseScheduleOptions = {}) => {
  const { onScheduleChange, initialType = 'now' } = options;
  
  const [scheduleType, setScheduleType] = useState<ScheduleType>(initialType);
  const [delayMinutes, setDelayMinutes] = useState<number>();
  const [scheduledAt, setScheduledAt] = useState<Date>();
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('');

  const updateSchedule = (type: ScheduleType, delay?: number, scheduledAtDate?: Date) => {
    setScheduleType(type);
    setDelayMinutes(delay);
    setScheduledAt(scheduledAtDate);
    
    if (onScheduleChange) {
      onScheduleChange({ scheduleType: type, delayMinutes: delay, scheduledAt: scheduledAtDate });
    }
  };

  const handleTypeChange = (type: ScheduleType) => {
    updateSchedule(type);
  };

  const handleDelayChange = (minutes: number) => {
    updateSchedule('delay', minutes);
  };

  const handleDateTimeChange = (dateValue?: string, timeValue?: string) => {
    const currentDate = dateValue !== undefined ? dateValue : scheduledDate;
    const currentTime = timeValue !== undefined ? timeValue : scheduledTime;
    
    if (currentDate && currentTime) {
      const [hours, minutes] = currentTime.split(':').map(Number);
      const [year, month, day] = currentDate.split('-').map(Number);
      
      if (!isNaN(hours) && !isNaN(minutes) && !isNaN(year) && !isNaN(month) && !isNaN(day)) {
        // Create date in local timezone
        const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
        if (!isNaN(date.getTime())) {
          console.log('Date constructed in useSchedule:', {
            input: { scheduledDate: currentDate, scheduledTime: currentTime },
            parsed: { year, month: month - 1, day, hours, minutes },
            localDate: date.toLocaleString('es-ES', { timeZone: 'America/Lima' }),
            utcDate: date.toISOString(),
            timestamp: date.getTime()
          });
          updateSchedule('datetime', undefined, date);
        }
      }
    }
  };

  const validateSchedule = (toast: { error: (msg: string) => void; warning: (msg: string) => void }): boolean => {
    if (scheduleType === 'datetime') {
      if (!scheduledAt) {
        toast.error('Por favor selecciona una fecha y hora para programar el envío');
        return false;
      }
      
      const now = new Date();
      const diffSeconds = Math.round((scheduledAt.getTime() - now.getTime()) / 1000);
      
      if (diffSeconds < 30) {
        if (diffSeconds < 0) {
          toast.error('La fecha y hora programada está en el pasado. Por favor selecciona una fecha y hora futura.');
          return false;
        } else {
          toast.warning(`La fecha y hora programada está muy cerca del tiempo actual (faltan ${diffSeconds} segundos). Debe ser al menos 30 segundos en el futuro.`);
          return false;
        }
      }
    }

    if (scheduleType === 'delay' && (!delayMinutes || delayMinutes <= 0)) {
      toast.error('Por favor ingresa un número válido de minutos para el retraso');
      return false;
    }

    return true;
  };

  const reset = () => {
    setScheduleType('now');
    setDelayMinutes(undefined);
    setScheduledAt(undefined);
    setScheduledDate('');
    setScheduledTime('');
  };

  return {
    scheduleType,
    delayMinutes,
    scheduledAt,
    scheduledDate,
    scheduledTime,
    setScheduledDate,
    setScheduledTime,
    handleTypeChange,
    handleDelayChange,
    handleDateTimeChange,
    validateSchedule,
    reset,
    updateSchedule
  };
};

