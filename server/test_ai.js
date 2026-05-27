import { generateAIResponseWithFailover } from './utils/aiService.js';

const openrouterKey = process.env.OPENROUTER_API_KEY || 'sk-or-v1-dee31e57dfb95cbeb127...'; // TU_OPENROUTER_KEY
const groqKey = process.env.GROQ_API_KEY || 'gsk_gPrGCh1ZCeDAIEwm4uJQWGdyb3FY...'; // TU_GROQ_KEY

async function runTest() {
  console.log('--- Probando Proveedor: OpenRouter (Modelo: openrouter/free) ---');
  try {
    const res = await generateAIResponseWithFailover({
      selectedProvider: 'openrouter',
      selectedModel: 'openrouter/free',
      systemPrompt: 'Responde con un saludo muy corto y di que eres OpenRouter.',
      userMessage: 'Hola, ¿quién eres?',
      history: [],
      attachments: [],
      customApiKey: openrouterKey,
      globalConfig: {
        aiFailoverEnabled: false
      }
    });
    console.log('✅ Respuesta de OpenRouter:', res);
  } catch (err) {
    console.error('❌ Error en OpenRouter:', err.message);
  }

  console.log('\n--- Probando Proveedor: Groq ---');
  try {
    const res = await generateAIResponseWithFailover({
      selectedProvider: 'groq',
      selectedModel: 'llama-3.3-70b-versatile',
      systemPrompt: 'Responde con un saludo muy corto y di que eres Groq.',
      userMessage: 'Hola, ¿quién eres?',
      history: [],
      attachments: [],
      customApiKey: groqKey,
      globalConfig: {
        aiFailoverEnabled: false
      }
    });
    console.log('✅ Respuesta de Groq:', res);
  } catch (err) {
    console.error('❌ Error en Groq:', err.message);
  }
}

runTest();
