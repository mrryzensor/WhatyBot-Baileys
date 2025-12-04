import { useState, useMemo } from 'react';
import { User } from '../services/usersApi';
import * as XLSX from 'xlsx';

export interface ExcelUser {
  email?: string;
  username?: string;
  subscriptionType?: string;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  vigencia?: string;
  plan?: string;
  suscripcion?: string;
  [key: string]: any; // Para otras columnas dinámicas
}

export interface UserComparison {
  excelUser: ExcelUser;
  existingUser?: User;
  matchType: 'email' | 'username' | 'none';
  needsUpdate: boolean;
  differences: {
    field: string;
    excelValue: any;
    existingValue: any;
  }[];
}

interface ColumnMapping {
  email?: string;
  username?: string;
  subscriptionType?: string;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  [key: string]: string | undefined;
}

/**
 * Hook para comparar usuarios de Excel con usuarios existentes
 */
export const useUserComparison = () => {
  const [excelUsers, setExcelUsers] = useState<ExcelUser[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [existingUsers, setExistingUsers] = useState<User[]>([]);

  /**
   * Detecta automáticamente las columnas del Excel
   */
  const detectColumns = (headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {};
    
    headers.forEach((header, index) => {
      const lowerHeader = header.toLowerCase().trim();
      
      // Detectar email
      if (!mapping.email && (
        lowerHeader.includes('email') || 
        lowerHeader.includes('correo') || 
        lowerHeader.includes('e-mail') ||
        lowerHeader === 'mail'
      )) {
        mapping.email = header;
      }
      
      // Detectar username
      if (!mapping.username && (
        lowerHeader.includes('username') || 
        lowerHeader.includes('usuario') || 
        lowerHeader.includes('user') ||
        lowerHeader.includes('nombre')
      )) {
        mapping.username = header;
      }
      
      // Detectar tipo de suscripción
      if (!mapping.subscriptionType && (
        lowerHeader.includes('suscripcion') || 
        lowerHeader.includes('subscription') || 
        lowerHeader.includes('plan') ||
        lowerHeader.includes('tipo') ||
        lowerHeader === 'plan'
      )) {
        mapping.subscriptionType = header;
      }
      
      // Detectar fecha inicio
      if (!mapping.subscriptionStartDate && (
        lowerHeader.includes('inicio') || 
        lowerHeader.includes('start') || 
        lowerHeader.includes('fecha inicio') ||
        lowerHeader.includes('fecha_inicio')
      )) {
        mapping.subscriptionStartDate = header;
      }
      
      // Detectar fecha fin / vigencia
      if (!mapping.subscriptionEndDate && (
        lowerHeader.includes('fin') || 
        lowerHeader.includes('end') || 
        lowerHeader.includes('vigencia') ||
        lowerHeader.includes('vencimiento') ||
        lowerHeader.includes('expira') ||
        lowerHeader.includes('fecha fin') ||
        lowerHeader.includes('fecha_fin')
      )) {
        mapping.subscriptionEndDate = header;
      }
    });
    
    return mapping;
  };

  /**
   * Procesa un archivo Excel y extrae usuarios
   */
  const processExcelFile = async (file: File): Promise<ExcelUser[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
          
          if (jsonData.length < 2) {
            reject(new Error('El archivo Excel debe tener al menos una fila de encabezados y una fila de datos'));
            return;
          }
          
          const headers = jsonData[0].map((h: any) => String(h || '').trim());
          const detectedMapping = detectColumns(headers);
          setColumnMapping(detectedMapping);
          
          const users: ExcelUser[] = [];
          
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.every((cell: any) => !cell)) continue; // Skip empty rows
            
            const user: ExcelUser = {};
            
            headers.forEach((header, index) => {
              const value = row[index];
              if (value !== undefined && value !== null && value !== '') {
                user[header] = value;
              }
            });
            
            // Normalizar datos según el mapeo detectado
            if (detectedMapping.email && user[detectedMapping.email]) {
              user.email = String(user[detectedMapping.email]).trim();
            }
            if (detectedMapping.username && user[detectedMapping.username]) {
              user.username = String(user[detectedMapping.username]).trim();
            }
            if (detectedMapping.subscriptionType && user[detectedMapping.subscriptionType]) {
              const subType = String(user[detectedMapping.subscriptionType]).toLowerCase().trim();
              // Normalizar valores comunes
              if (subType.includes('gratuito') || subType === 'free') {
                user.subscriptionType = 'gratuito';
              } else if (subType.includes('pro')) {
                user.subscriptionType = 'pro';
              } else if (subType.includes('elite')) {
                user.subscriptionType = 'elite';
              } else {
                user.subscriptionType = subType;
              }
            }
            if (detectedMapping.subscriptionStartDate && user[detectedMapping.subscriptionStartDate]) {
              user.subscriptionStartDate = String(user[detectedMapping.subscriptionStartDate]).trim();
            }
            if (detectedMapping.subscriptionEndDate && user[detectedMapping.subscriptionEndDate]) {
              user.subscriptionEndDate = String(user[detectedMapping.subscriptionEndDate]).trim();
            }
            
            // Si hay una columna "vigencia", intentar parsearla
            if (user.vigencia) {
              const vigenciaStr = String(user.vigencia).toLowerCase();
              // Intentar extraer fecha o días
              const dateMatch = vigenciaStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
              if (dateMatch) {
                user.subscriptionEndDate = vigenciaStr;
              }
            }
            
            if (user.email || user.username) {
              users.push(user);
            }
          }
          
          resolve(users);
        } catch (error: any) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsArrayBuffer(file);
    });
  };

  /**
   * Compara usuarios de Excel con usuarios existentes
   */
  const compareUsers = useMemo((): UserComparison[] => {
    if (!excelUsers.length || !existingUsers.length) {
      return excelUsers.map(excelUser => ({
        excelUser,
        matchType: 'none' as const,
        needsUpdate: false,
        differences: []
      }));
    }
    
    return excelUsers.map(excelUser => {
      let existingUser: User | undefined;
      let matchType: 'email' | 'username' | 'none' = 'none';
      
      // Intentar encontrar por email
      if (excelUser.email) {
        existingUser = existingUsers.find(u => 
          u.email && u.email.toLowerCase() === excelUser.email!.toLowerCase()
        );
        if (existingUser) {
          matchType = 'email';
        }
      }
      
      // Si no se encontró por email, intentar por username
      if (!existingUser && excelUser.username) {
        existingUser = existingUsers.find(u => 
          u.username.toLowerCase() === excelUser.username!.toLowerCase()
        );
        if (existingUser) {
          matchType = 'username';
        }
      }
      
      // Si hay usuario existente, comparar diferencias
      const differences: { field: string; excelValue: any; existingValue: any }[] = [];
      let needsUpdate = false;
      
      if (existingUser) {
        // Comparar tipo de suscripción
        if (excelUser.subscriptionType && 
            excelUser.subscriptionType.toLowerCase() !== existingUser.subscription_type.toLowerCase()) {
          differences.push({
            field: 'subscriptionType',
            excelValue: excelUser.subscriptionType,
            existingValue: existingUser.subscription_type
          });
          needsUpdate = true;
        }
        
        // Comparar fecha de inicio
        if (excelUser.subscriptionStartDate && existingUser.subscription_start_date) {
          const excelDate = new Date(excelUser.subscriptionStartDate);
          const existingDate = new Date(existingUser.subscription_start_date);
          if (isNaN(excelDate.getTime()) || excelDate.getTime() !== existingDate.getTime()) {
            differences.push({
              field: 'subscriptionStartDate',
              excelValue: excelUser.subscriptionStartDate,
              existingValue: existingUser.subscription_start_date
            });
            needsUpdate = true;
          }
        }
        
        // Comparar fecha de fin / vigencia
        if (excelUser.subscriptionEndDate && existingUser.subscription_end_date) {
          const excelDate = new Date(excelUser.subscriptionEndDate);
          const existingDate = new Date(existingUser.subscription_end_date);
          if (isNaN(excelDate.getTime()) || excelDate.getTime() !== existingDate.getTime()) {
            differences.push({
              field: 'subscriptionEndDate',
              excelValue: excelUser.subscriptionEndDate,
              existingValue: existingUser.subscription_end_date
            });
            needsUpdate = true;
          }
        }
      }
      
      return {
        excelUser,
        existingUser,
        matchType,
        needsUpdate,
        differences
      };
    });
  }, [excelUsers, existingUsers]);

  return {
    excelUsers,
    setExcelUsers,
    columnMapping,
    setColumnMapping,
    existingUsers,
    setExistingUsers,
    processExcelFile,
    compareUsers
  };
};

