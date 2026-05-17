import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ detail: 'Token de autenticación requerido.' });

  const { transcription, instructions } = req.body as { transcription: string; instructions: string[] };
  if (!transcription) return res.status(400).json({ detail: 'transcription es requerido.' });

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ detail: 'No autorizado.' });

  try {
    const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genai.getGenerativeModel({ model: 'gemini-2.5-pro', safetySettings: SAFETY_SETTINGS });

    const instructionsBlock = instructions && instructions.length > 0
      ? `\n\nInstrucciones adicionales que DEBES seguir:\n${instructions.map(i => `- ${i}`).join('\n')}`
      : '';

    const prompt = `Basado en la siguiente transcripción de una llamada de negocios, genera un resumen ejecutivo enfocado ÚNICAMENTE en los aspectos comerciales: precios, cantidades, productos, tallas, fletes, fechas de entrega y cualquier acuerdo de negocio relevante. Ignora conversaciones informales o contenido no relacionado con el negocio.${instructionsBlock}

Transcripción:
---
${transcription}
---`;

    const result = await model.generateContent(prompt);
    return res.status(200).json({ summary: result.response.text() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error en /api/summarize-business:', error);
    return res.status(500).json({ detail: message });
  }
}
