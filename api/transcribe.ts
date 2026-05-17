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

  const { storage_path, file_name, mime_type } = req.body as {
    storage_path: string;
    file_name: string;
    mime_type: string;
  };

  if (!storage_path || !file_name) {
    return res.status(400).json({ detail: 'storage_path y file_name son requeridos.' });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );

  // Verify the token belongs to a real user
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ detail: 'No autorizado.' });

  try {
    const { data: fileBlob, error: storageError } = await supabaseAdmin.storage
      .from('audios')
      .download(storage_path);

    if (storageError || !fileBlob) {
      return res.status(500).json({ detail: `Error descargando audio: ${storageError?.message}` });
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // Normalize MIME type — phones sometimes report video/3gpp for .m4a files
    let effectiveMimeType = mime_type || 'audio/m4a';
    if (effectiveMimeType === 'video/3gpp' || effectiveMimeType === 'audio/3gpp') {
      effectiveMimeType = 'audio/m4a';
    }

    const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash', safetySettings: SAFETY_SETTINGS });

    const result = await model.generateContent([
      'Transcribe this audio recording.',
      { inlineData: { mimeType: effectiveMimeType, data: base64Data } },
    ]);

    const transcriptionText = result.response.text();

    const { data: saved, error: dbError } = await supabaseAdmin
      .from('transcriptions')
      .insert({
        user_id: user.id,
        file_name: file_name,
        transcription: transcriptionText,
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('Error al guardar en transcriptions:', dbError.message, dbError.details);
    }

    return res.status(200).json({
      transcription: transcriptionText,
      fileName: file_name,
      transcriptionId: saved?.id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error en /api/transcribe:', error);
    return res.status(500).json({ detail: message });
  }
}
