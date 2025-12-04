import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generateMarketingCopy = async (
  topic: string,
  tone: 'professional' | 'friendly' | 'urgent' = 'friendly'
): Promise<string> => {
  try {
    const ai = getAiClient();
    const prompt = `Write a short, engaging WhatsApp marketing message about: "${topic}". 
    Tone: ${tone}. 
    Keep it under 100 words. 
    Use emojis. 
    Do not include a greeting (I will add variables later).`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text.trim();
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Could not generate copy. Please check your API key.";
  }
};