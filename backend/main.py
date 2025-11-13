import os
import uvicorn
import io
import json 
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# --- Importaciones de Google Drive ---
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
# --- Fin de Importaciones ---


# --- Configuración ---
if os.getenv("RENDER") != "true":
    load_dotenv() 

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# --- Configuración de Google Drive ---
SERVICE_ACCOUNT_JSON_STRING = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

creds = None
drive_service = None

if SERVICE_ACCOUNT_JSON_STRING:
    try:
        SERVICE_ACCOUNT_INFO = json.loads(SERVICE_ACCOUNT_JSON_STRING)
        creds = service_account.Credentials.from_service_account_info(
            SERVICE_ACCOUNT_INFO, scopes=SCOPES
        )
        drive_service = build('drive', 'v3', credentials=creds)
    except Exception as e:
        print(f"Error al cargar credenciales de Google Drive: {e}")
else:
    print("ADVERTENCIA: GOOGLE_SERVICE_ACCOUNT_JSON no está configurado.")

app = FastAPI()

# --- Configuración de Seguridad (CORS) ---
origins = [
    "https://mj-transcripciones.vercel.app", 
    "http://localhost:5173", 
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ================================== ---
# ---       ¡BLOQUE CORREGIDO!           ---
# --- ================================== ---
# (Quité las comillas extra " al final de cada línea)
safety_settings = [
    {"category": genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH, "threshold": genai.types.HarmBlockThreshold.BLOCK_NONE},
    {"category": genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, "threshold": genai.types.HarmBlockThreshold.BLOCK_NONE},
    {"category": genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT, "threshold": genai.types.HarmBlockThreshold.BLOCK_NONE},
    {"category": genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, "threshold": genai.types.HarmBlockThreshold.BLOCK_NONE},
]

# --- Modelos de Datos (Pydantic) ---
class GeneralSummaryRequest(BaseModel):
    transcription: str

class BusinessSummaryRequest(BaseModel):
    transcription: str
    instructions: list[str] = Field(default_factory=list)

class DriveRequest(BaseModel):
    drive_file_id: str

# --- Endpoints (Las "URLs" de nuestra API) ---

@app.get("/")
def read_root():
    return {"status": "MJTranscripciones Backend ¡funcionando!"}

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No se subió ningún archivo.")

    try:
        audio_part = {
            "mime_type": file.content_type,
            "data": await file.read()
        }
        
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash", 
            safety_settings=safety_settings
        )
        
        response = await model.generate_content_async(
            ["Transcribe this audio recording.", audio_part]
        )

        return {"transcription": response.text}

    except Exception as e:
        print(f"Error en /transcribe: {e}")
        raise HTTPException(status_code=500, detail=str(e)) 
    finally:
        if file:
            await file.close()

@app.post("/transcribe-from-drive")
async def transcribe_from_drive(request: DriveRequest):
    if not drive_service:
        raise HTTPException(status_code=500, detail="Servicio de Google Drive no configurado en el backend.")
    
    if not request.drive_file_id:
        raise HTTPException(status_code=400, detail="No se proporcionó ID de Google Drive.")

    try:
        file_id = request.drive_file_id
        
        file_metadata = drive_service.files().get(fileId=file_id, fields='mimeType, name').execute()
        mime_type = file_metadata.get('mimeType')
        file_name = file_metadata.get('name')
        print(f"Procesando archivo desde Drive: {file_name} ({mime_type})")

        drive_request = drive_service.files().get_media(fileId=file_id)
        file_bytes_io = io.BytesIO()
        downloader = MediaIoBaseDownload(file_bytes_io, drive_request)
        
        done = False
        while done is False:
            status, done = downloader.next_chunk()

        audio_part = {
            "mime_type": mime_type,
            "data": file_bytes_io.getvalue()
        }
        
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash", 
            safety_settings=safety_settings
        )
        
        response = await model.generate_content_async(
            ["Transcribe this audio recording.", audio_part]
        )

        return {"transcription": response.text, "fileName": file_name}

    except Exception as e:
        print(f"Error en /transcribe-from-drive: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/summarize-general")
async def summarize_general(request: GeneralSummaryRequest):
    if not request.transcription:
        raise HTTPException(status_code=400, detail="No se proporcionó transcripción.")

    try:
        prompt = f"""Basado en la siguiente transcripción de una llamada, genera un resumen general claro y conciso. El resumen debe identificar los puntos clave, las acciones a seguir y el sentimiento general de la llamada, sin asumir ningún contexto de negocio específico.
        
        Transcripción:
        ---
        {request.transcription}
        ---
        """
        
        model = genai.GenerativeModel(
            model_name="gemini-2.5-pro",
            safety_settings=safety_settings
        )
        
        response = await model.generate_content_async(prompt)
        
        return {"summary": response.text}

    except Exception as e:
        print(f"Error en /summarize-general: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/summarize-business")
async def summarize_business(request: BusinessSummaryRequest):
    if not request.transcription:
        raise HTTPException(status_code=400, detail="No se proporcionó transcripción.")

    try:
        permanent_instructions_text = ""
        if request.instructions:
            instructions_joined = ". ".join(request.instructions)
            permanent_instructions_text = f"Para este resumen, aplica estas reglas e instrucciones permanentes en todo momento: {instructions_joined}"

        prompt = f"""Basado en la siguiente transcripción de una llamada, genera un resumen de negocio claro y conciso. El resumen debe identificar los puntos clave y las acciones a seguir, enfocándose en temas relevantes para un negocio de mariscos.
        
        {permanent_instructions_text}

        Transcripción:
        ---
        {request.transcription}
        ---
        """
        
        model = genai.GenerativeModel(
            model_name="gemini-2.5-pro",
            safety_settings=safety_settings
        )
        
        response = await model.generate_content_async(prompt)
        
        return {"summary": response.text}

    except Exception as e:
        print(f"Error en /summarize-business: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)