import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
// 1) En desarrollo: intenta cargar también el .env de la raíz del proyecto (un nivel arriba)
// 2) En la app empaquetada: electron-builder copia el .env raíz a resources/server/.env,
//    que corresponde a __dirname, por lo que sigue funcionando igual.

const rootEnvPath = path.join(__dirname, '..', '.env');
const serverEnvPath = path.join(__dirname, '.env');

// Primero intenta cargar el .env de la raíz (útil en desarrollo)
dotenv.config({ path: rootEnvPath });
// Luego el .env específico de server (útil en producción empaquetada)
dotenv.config({ path: serverEnvPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados en el archivo .env');
    console.error('Por favor, agrega las siguientes variables:');
    console.error('SUPABASE_URL=tu_url_de_supabase');
    console.error('SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key');
    process.exit(1);
}

// Crear cliente de Supabase con service role key para acceso completo
export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

export default supabase;

