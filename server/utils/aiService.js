import axios from 'axios';

// Modelos por defecto para cada proveedor en caso de failover (salto automático)
export const FALLBACK_MODELS = {
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
  sambanova: 'llama3-70b',
  anthropic: 'claude-3-5-sonnet-latest',
  deepseek: 'deepseek-chat',
  openrouter: 'openrouter/free',
  deepinfra: 'meta-llama/Meta-Llama-3-70B-Instruct',
  zhipu: 'glm-4-flash',
  huggingface: 'meta-llama/Meta-Llama-3-8B-Instruct'
};

/**
 * Llama al API de OpenAI
 */
async function callOpenAI(apiKey, model, systemPrompt, userMessage, history, attachments) {
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Agregar historial
  history.forEach(msg => {
    messages.push({ role: msg.role, content: msg.content });
  });

  // Agregar mensaje actual
  let content = userMessage;
  if (attachments && attachments.length > 0) {
    content = [{ type: 'text', text: userMessage }];
    attachments.forEach(att => {
      // Solo enviamos imágenes a OpenAI de forma multimodal
      if (att.mimeType.startsWith('image/')) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${att.mimeType};base64,${att.base64}`
          }
        });
      }
    });
  }

  messages.push({ role: 'user', content });

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: model || FALLBACK_MODELS.openai,
      messages
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  return response.data?.choices?.[0]?.message?.content || '';
}

/**
 * Llama al API de Anthropic (Claude)
 */
async function callAnthropic(apiKey, model, systemPrompt, userMessage, history, attachments) {
  const messages = [];

  // Agregar historial (filtrado y formateado)
  history.forEach(msg => {
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    });
  });

  // Mensaje actual
  let content = userMessage;
  if (attachments && attachments.length > 0) {
    content = [{ type: 'text', text: userMessage }];
    attachments.forEach(att => {
      if (att.mimeType.startsWith('image/')) {
        // Formato para imágenes en Anthropic
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mimeType,
            data: att.base64
          }
        });
      }
    });
  }

  messages.push({ role: 'user', content });

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: model || FALLBACK_MODELS.anthropic,
      system: systemPrompt,
      messages,
      max_tokens: 4096
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 30000
    }
  );

  return response.data?.content?.[0]?.text || '';
}

/**
 * Llama al API de Google Gemini (AI Studio)
 */
async function callGemini(apiKey, model, systemPrompt, userMessage, history, attachments) {
  const contents = [];

  // Mapear historial
  history.forEach(msg => {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    });
  });

  // Agregar mensaje actual con attachments multimodales (Gemini soporta imágenes, audio, video de forma nativa)
  const parts = [{ text: userMessage }];
  if (attachments && attachments.length > 0) {
    attachments.forEach(att => {
      parts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.base64
        }
      });
    });
  }

  contents.push({
    role: 'user',
    parts
  });

  const selectedModel = model || FALLBACK_MODELS.google;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

  const payload = {
    contents
  };

  if (systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 35000
  });

  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Genérico para proveedores compatibles con el formato OpenAI Chat
 */
async function callOpenAICompatible(url, apiKey, model, defaultModel, systemPrompt, userMessage, history) {
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  history.forEach(msg => {
    messages.push({ role: msg.role, content: msg.content });
  });

  messages.push({ role: 'user', content: userMessage });

  const response = await axios.post(
    url,
    {
      model: model || defaultModel,
      messages
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://whatybot.com',
        'X-Title': 'WhatyBot'
      },
      timeout: 30000
    }
  );

  return response.data?.choices?.[0]?.message?.content || '';
}

/**
 * Función principal para despachar llamadas al proveedor elegido
 */
async function executeProviderCall(provider, apiKey, model, systemPrompt, userMessage, history, attachments) {
  switch (provider) {
    case 'google':
      return await callGemini(apiKey, model, systemPrompt, userMessage, history, attachments);
    case 'openai':
      return await callOpenAI(apiKey, model, systemPrompt, userMessage, history, attachments);
    case 'anthropic':
      return await callAnthropic(apiKey, model, systemPrompt, userMessage, history, attachments);
    case 'deepseek':
      return await callOpenAICompatible('https://api.deepseek.com/v1/chat/completions', apiKey, model, FALLBACK_MODELS.deepseek, systemPrompt, userMessage, history);
    case 'openrouter':
      return await callOpenAICompatible('https://openrouter.ai/api/v1/chat/completions', apiKey, model, FALLBACK_MODELS.openrouter, systemPrompt, userMessage, history);
    case 'groq':
      return await callOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', apiKey, model, FALLBACK_MODELS.groq, systemPrompt, userMessage, history);
    case 'sambanova':
      return await callOpenAICompatible('https://api.sambanova.ai/v1/chat/completions', apiKey, model, FALLBACK_MODELS.sambanova, systemPrompt, userMessage, history);
    case 'deepinfra':
      return await callOpenAICompatible('https://api.deepinfra.com/v1/openai/chat/completions', apiKey, model, FALLBACK_MODELS.deepinfra, systemPrompt, userMessage, history);
    case 'zhipu':
      return await callOpenAICompatible('https://open.bigmodel.cn/api/paas/v4/chat/completions', apiKey, model, FALLBACK_MODELS.zhipu, systemPrompt, userMessage, history);
    case 'huggingface':
      return await callOpenAICompatible('https://api-inference.huggingface.co/v1/chat/completions', apiKey, model, FALLBACK_MODELS.huggingface, systemPrompt, userMessage, history);
    default:
      throw new Error(`Proveedor de IA desconocido o no soportado: ${provider}`);
  }
}

/**
 * Envía una petición de inferencia a un proveedor de IA con soporte de Failover (salto automático)
 * 
 * @param {object} params
 * @param {string} params.selectedProvider - Proveedor seleccionado por la regla
 * @param {string} params.selectedModel - Modelo seleccionado por la regla
 * @param {string} params.systemPrompt - Prompt de sistema
 * @param {string} params.userMessage - Mensaje actual del usuario
 * @param {Array} params.history - Historial de mensajes [{role: 'user'|'assistant', content: '...'}]
 * @param {Array} params.attachments - Adjuntos multimodales [{base64: '...', mimeType: '...'}]
 * @param {string} params.customApiKey - API Key específica de la regla (opcional)
 * @param {object} params.globalConfig - Configuración global con llaves de API
 * @returns {Promise<string>} Respuesta de la IA
 */
export async function generateAIResponseWithFailover({
  selectedProvider,
  selectedModel,
  systemPrompt,
  userMessage,
  history = [],
  attachments = [],
  customApiKey,
  globalConfig = {}
}) {
  const providersPriority = [
    'google', 'openai', 'groq', 'sambanova', 'anthropic', 'deepseek', 'openrouter', 'deepinfra', 'zhipu', 'huggingface'
  ];

  // 1. Determinar llave de API activa
  let activeProvider = selectedProvider || 'google';
  let activeKey = customApiKey || globalConfig[`${activeProvider}ApiKey`];

  // Auto-seleccionar primer proveedor configurado si el seleccionado no tiene API Key
  if (!activeKey) {
    console.log(`[AI Inference] El proveedor principal "${activeProvider}" no tiene API Key configurada.`);
    const configuredProvider = providersPriority.find(p => !!globalConfig[`${p}ApiKey`]);
    if (configuredProvider) {
      console.log(`[AI Inference] 🔄 Auto-seleccionando proveedor configurado alternativo: "${configuredProvider}"`);
      activeProvider = configuredProvider;
      activeKey = globalConfig[`${configuredProvider}ApiKey`];
    }
  }

  let activeModel = selectedModel;
  if (!selectedProvider || activeProvider !== selectedProvider || !activeModel) {
    activeModel = FALLBACK_MODELS[activeProvider];
  }

  console.log(`[AI Inference] Iniciando con proveedor principal: ${activeProvider} (${activeModel})`);

  // Intentar llamada inicial
  try {
    if (!activeKey) {
      throw new Error(`API Key no configurada para el proveedor: ${activeProvider}`);
    }
    return await executeProviderCall(activeProvider, activeKey, activeModel, systemPrompt, userMessage, history, attachments);
  } catch (initialError) {
    console.error(`[AI Failover] ❌ Error con proveedor inicial ${activeProvider}: ${initialError.message}`);

    // LiteLLM-style failover: siempre activo para asegurar la continuidad de servicio
    console.log('[AI Failover] ⚡ Iniciando failover inteligente de proveedores...');

    // 2. Generar lista de proveedores alternativos disponibles (que tengan API Key configurada)
    const fallbackProviders = providersPriority.filter(p => {
      // No repetir el proveedor inicial que acaba de fallar
      if (p === activeProvider) return false;
      // Debe tener API key configurada en globalConfig
      return !!globalConfig[`${p}ApiKey`];
    });

    if (fallbackProviders.length === 0) {
      console.warn('[AI Failover] No hay llaves de API de respaldo configuradas globalmente.');
      throw initialError;
    }

    console.log(`[AI Failover] Proveedores de respaldo disponibles: [${fallbackProviders.join(', ')}]`);

    // 3. Iterar por cada proveedor de respaldo hasta que uno funcione
    for (const provider of fallbackProviders) {
      const fallbackKey = globalConfig[`${provider}ApiKey`];
      const fallbackModel = FALLBACK_MODELS[provider];

      console.log(`[AI Failover] ➡️ Saltando a proveedor de respaldo: ${provider} (Modelo: ${fallbackModel})`);

      try {
        const responseText = await executeProviderCall(
          provider,
          fallbackKey,
          fallbackModel,
          systemPrompt,
          userMessage,
          history,
          attachments
        );
        
        console.log(`[AI Failover] 🥳 ¡Respuesta recuperada con éxito usando ${provider}!`);
        return responseText;
      } catch (fallbackError) {
        console.error(`[AI Failover] ❌ Proveedor de respaldo ${provider} falló: ${fallbackError.message}`);
        // Continúa al siguiente proveedor de la lista
      }
    }

    // Si todos fallaron
    console.error('[AI Failover] 😭 Todos los proveedores configurados fallaron.');
    throw new Error(`Inferencia de IA fallida en todos los proveedores disponibles. Último error: ${initialError.message}`);
  }
}
