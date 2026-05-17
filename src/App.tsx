import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { createClient } from '@supabase/supabase-js';
import type { User, Session } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// --- DEFINICIÓN DE ESTADO (COLA) ---
type FileStatus = 'pending' | 'processing' | 'completed' | 'error';
type FileSource = 'local' | 'drive';

interface FileQueueItem {
  id: string;
  file: File | null;
  driveFileId: string | null;
  source: FileSource;
  displayName: string;
  status: FileStatus;
  transcription: string;
  generalSummary: string;
  businessSummary: string;
  errorMessage?: string;
}
// --- ================================== ---

const App: React.FC = () => {

  // --- AUTH STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  // --- ============ ---

  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([]);
  const [status, setStatus] = useState<string>('Por favor, selecciona archivos de audio o procesa desde Google Drive.');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveLinks, setDriveLinks] = useState('');

  const [globalInstructions, setGlobalInstructions] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newInstruction, setNewInstruction] = useState('');

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [folderIdM4a, setFolderIdM4a] = useState('');
  const [folderIdTxt, setFolderIdTxt] = useState('');

  const importFileInputRef = useRef<HTMLInputElement>(null);

  // --- AUTH EFFECT ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    try {
      const storedInstructions = localStorage.getItem('globalInstructions');
      if (storedInstructions) setGlobalInstructions(JSON.parse(storedInstructions));
      const storedApiKey = localStorage.getItem('geminiApiKey');
      const storedM4a = localStorage.getItem('folderIdM4a');
      const storedTxt = localStorage.getItem('folderIdTxt');
      if (storedApiKey) setGeminiApiKey(storedApiKey);
      if (storedM4a) setFolderIdM4a(storedM4a);
      if (storedTxt) setFolderIdTxt(storedTxt);
    } catch (error) {
      console.error("Failed to parse data from localStorage", error);
    }
  }, []);

  // --- AUTH HANDLERS ---
  const handleSignIn = async () => {
    setAuthSubmitting(true);
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    setAuthSubmitting(false);
  };

  const handleSignUp = async () => {
    setAuthSubmitting(true);
    setAuthError('');
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    else setAuthError('Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión.');
    setAuthSubmitting(false);
  };

  const handleSignOut = () => supabase.auth.signOut();
  // --- ============== ---

  const saveSettings = () => {
    localStorage.setItem('geminiApiKey', geminiApiKey);
    localStorage.setItem('folderIdM4a', folderIdM4a);
    localStorage.setItem('folderIdTxt', folderIdTxt);
    setShowSettingsModal(false);
    setStatus("Configuración guardada correctamente.");
  };

  const saveGlobalInstructions = (instructions: string[]) => {
    setGlobalInstructions(instructions);
    localStorage.setItem('globalInstructions', JSON.stringify(instructions));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles) return;

    const newFiles: FileQueueItem[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      newFiles.push({
        id: `${file.name}-${new Date().getTime()}`,
        file,
        driveFileId: null,
        source: 'local',
        displayName: file.name,
        status: 'pending',
        transcription: '',
        generalSummary: '',
        businessSummary: '',
      });
    }

    setFileQueue(prevQueue => [...prevQueue, ...newFiles]);
    setStatus(`${selectedFiles.length} archivo(s) añadido(s) a la cola.`);
  };

  const updateFileInQueue = (itemId: string, updates: Partial<FileQueueItem>) => {
    setFileQueue(currentQueue =>
      currentQueue.map(item => item.id === itemId ? { ...item, ...updates } : item)
    );
  };

  const processSingleFile = async (itemId: string) => {
    const item = fileQueue.find(i => i.id === itemId);
    if (!item || (item.status !== 'pending' && item.status !== 'error')) return;

    const token = session?.access_token;
    if (!token) {
      updateFileInQueue(itemId, { status: 'error', errorMessage: 'Sin sesión activa. Recarga la página e inicia sesión.' });
      return;
    }

    setStatus(`Procesando: ${item.displayName}...`);
    updateFileInQueue(itemId, { status: 'processing', errorMessage: '' });

    try {
      let transcription = '';
      let fileName = item.displayName;
      let generalSummary = '';
      let businessSummary = '';

      if (item.source === 'local' && item.file) {
        // Flujo local: sube a Supabase Storage → /api/transcribe → /api/summarize-*
        const transData = await runTranscription(item.file, user!.id, token);
        transcription = transData.transcription;
        fileName = transData.fileName;
        const transcriptionId = transData.transcriptionId;

        updateFileInQueue(itemId, { transcription, displayName: fileName });
        setStatus(`Transcrito: ${fileName}. Generando resúmenes...`);

        generalSummary = await runGeneralSummary(transcription, token);
        updateFileInQueue(itemId, { generalSummary });
        businessSummary = await runBusinessSummary(transcription, globalInstructions, token);

        // Actualizar el registro con los resúmenes generados
        if (transcriptionId) {
          const { error: updateError } = await supabase
            .from('transcriptions')
            .update({ general_summary: generalSummary, business_summary: businessSummary })
            .eq('id', transcriptionId);
          if (updateError) console.error('Error actualizando resúmenes en Supabase:', updateError.message);
        }

      } else if (item.source === 'drive' && item.driveFileId) {
        // Flujo de Drive: llama al backend de Render (maneja Drive OAuth)
        setStatus(`Procesando (Drive): ${item.displayName}...`);
        const data = await runTranscriptionFromDrive(
          item.driveFileId,
          globalInstructions,
          geminiApiKey,
          folderIdM4a,
          folderIdTxt
        );
        transcription = data.transcription;
        fileName = data.fileName;
        generalSummary = data.generalSummary;
        businessSummary = data.businessSummary;
      } else {
        throw new Error("Archivo inválido en la cola.");
      }

      updateFileInQueue(itemId, {
        displayName: fileName,
        transcription,
        generalSummary,
        businessSummary,
        status: 'completed',
      });
      setStatus(`Completado: ${fileName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      console.error(`Error procesando ${item.displayName}:`, error);
      updateFileInQueue(itemId, { status: 'error', errorMessage });
      setStatus(`Error en ${item.displayName}, revisa la cola.`);
    }
  };

  const handleProcessAll = async () => {
    const pendingFiles = fileQueue.filter(item => item.status === 'pending');
    if (pendingFiles.length === 0) {
      setStatus("No hay archivos pendientes para procesar.");
      return;
    }

    setIsLoading(true);
    setStatus(`Iniciando procesamiento por lotes de ${pendingFiles.length} archivos...`);

    for (const item of pendingFiles) {
      await processSingleFile(item.id);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    setIsLoading(false);
    setStatus("Procesamiento por lotes finalizado.");
  };

  const parseDriveLinks = (text: string): string[] => {
    const ids: string[] = [];
    const regex = /\/file\/d\/([a-zA-Z0-9_-]{33})|id=([a-zA-Z0-9_-]{33})/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      ids.push(match[1] || match[2]);
    }
    return ids;
  };

  const handleProcessDriveLinks = () => {
    const fileIds = parseDriveLinks(driveLinks);
    if (fileIds.length === 0) {
      setStatus("No se encontraron IDs de Google Drive válidos en los enlaces.");
      return;
    }

    const newFiles: FileQueueItem[] = fileIds.map(id => ({
      id: `drive-${id}-${new Date().getTime()}`,
      file: null,
      driveFileId: id,
      source: 'drive',
      displayName: `Archivo de Drive (ID: ...${id.slice(-6)})`,
      status: 'pending',
      transcription: '',
      generalSummary: '',
      businessSummary: '',
    }));

    setFileQueue(prevQueue => [...prevQueue, ...newFiles]);
    setShowDriveModal(false);
    setDriveLinks('');
    setStatus(`${newFiles.length} archivo(s) de Drive añadidos. Presiona 'Procesar Todos' para iniciar.`);
  };

  const generateDocumentContent = (item: FileQueueItem): string => {
    return `
=========================================
REGISTRO DE LLAMADA
=========================================

Archivo Original: ${item.displayName}
Fecha de Procesamiento: ${new Date().toLocaleString()}

-----------------------------------------
1. TRANSCRIPCIÓN COMPLETA
-----------------------------------------

${item.transcription}

-----------------------------------------
2. RESUMEN GENERAL DE LA LLAMADA
-----------------------------------------

${item.generalSummary}

-----------------------------------------
3. RESUMEN DE NEGOCIO (PARA NOTAS RÁPIDAS)
-----------------------------------------

${item.businessSummary}
    `.trim();
  };

  const handleGenerateDocument = (item: FileQueueItem) => {
    if (!item || item.status !== 'completed') {
      setStatus("Este archivo no está completado.");
      return;
    }
    const docContent = generateDocumentContent(item);
    const blob = new Blob([docContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const baseFilename = item.displayName.split('.').slice(0, -1).join('.') || item.displayName;
    link.download = `${baseFilename}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus("Documento generado y descargado.");
  };

  const handleDownloadZip = async () => {
    const completedFiles = fileQueue.filter(item => item.status === 'completed');
    if (completedFiles.length === 0) {
      setStatus("No hay archivos completados para descargar.");
      return;
    }

    setStatus("Generando archivo .zip...");
    setIsLoading(true);
    const zip = new JSZip();

    for (const item of completedFiles) {
      const content = generateDocumentContent(item);
      const baseFilename = item.displayName.split('.').slice(0, -1).join('.') || item.displayName;
      zip.file(`${baseFilename}.txt`, content);
    }

    try {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MJTranscripciones_Lote_${new Date().getTime()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatus(`${completedFiles.length} archivos descargados en .zip.`);
    } catch (error) {
      console.error("Error generando el .zip:", error);
      setStatus("Error al generar el archivo .zip.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportInstructions = () => {
    if (globalInstructions.length === 0) {
      alert("No hay mejoras permanentes para exportar.");
      return;
    }
    const blob = new Blob([globalInstructions.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mejoras-permanentes.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportInstructions = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      saveGlobalInstructions(lines);
      alert(`${lines.length} mejoras importadas correctamente.`);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // --- ESTILOS ---
  const styles: { [key: string]: React.CSSProperties } = {
    container: { fontFamily: 'sans-serif', backgroundColor: '#f0f2f5', minHeight: '100vh', padding: '2rem' },
    header: { textAlign: 'center', marginBottom: '1rem', color: '#1c1e21' },
    card: { backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)', marginBottom: '1.5rem' },
    button: { backgroundColor: '#1877f2', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '6px', fontSize: '16px', cursor: 'pointer', margin: '0.5rem 0', display: 'inline-block', transition: 'background-color 0.3s' },
    buttonDisabled: { backgroundColor: '#a0bdf5', cursor: 'not-allowed' },
    buttonGreen: { backgroundColor: '#36a420' },
    buttonSmall: { padding: '8px 12px', fontSize: '14px', marginRight: '0.5rem' },
    textarea: { width: '100%', minHeight: '150px', padding: '10px', borderRadius: '6px', border: '1px solid #dddfe2', fontSize: '14px', boxSizing: 'border-box', marginTop: '1rem' },
    status: { textAlign: 'center', margin: '1.5rem 0', color: isLoading ? '#1877f2' : '#606770', fontWeight: 'bold' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: 'white', padding: '2rem', borderRadius: '8px', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' },
    modalInput: { width: 'calc(100% - 100px)', padding: '10px', borderRadius: '6px', border: '1px solid #dddfe2' },
    modalButton: { padding: '10px', marginLeft: '10px' },
    instructionItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #eee', color: '#1c1e21' },
    deleteButton: { backgroundColor: '#fa3e3e', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' },
    queueContainer: { maxHeight: '400px', overflowY: 'auto', border: '1px solid #dddfe2', borderRadius: '6px', padding: '1rem' },
    queueItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderBottom: '1px solid #eee' },
    queueItemName: { flexGrow: 1, marginRight: '1rem', color: '#1c1e21' },
    queueItemStatus: { fontWeight: 'bold', minWidth: '100px', textAlign: 'right', marginRight: '1rem', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' },
    statusPending: { color: '#606770', backgroundColor: '#f0f2f5' },
    statusProcessing: { color: '#1877f2', backgroundColor: '#e7f3ff' },
    statusCompleted: { color: '#36a420', backgroundColor: '#e6f7e2' },
    statusError: { color: '#fa3e3e', backgroundColor: '#fde7e7' },
    errorText: { fontSize: '12px', color: '#fa3e3e', marginTop: '4px', paddingLeft: '0.75rem', paddingRight: '0.75rem', paddingBottom: '0.75rem' },
  };

  const getStatusStyle = (s: FileStatus): React.CSSProperties => {
    switch (s) {
      case 'processing': return styles.statusProcessing;
      case 'completed': return styles.statusCompleted;
      case 'error': return styles.statusError;
      default: return styles.statusPending;
    }
  };

  // --- AUTH LOADING ---
  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'sans-serif', backgroundColor: '#f0f2f5' }}>
        <p style={{ color: '#606770', fontSize: '18px' }}>Cargando...</p>
      </div>
    );
  }

  // --- AUTH UI ---
  if (!user) {
    const isSignup = authView === 'signup';
    const inputStyle: React.CSSProperties = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dddfe2', boxSizing: 'border-box', fontSize: '14px' };
    const onKeyEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') isSignup ? handleSignUp() : handleSignIn(); };

    return (
      <div style={{ fontFamily: 'sans-serif', backgroundColor: '#f0f2f5', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
          <h1 style={{ textAlign: 'center', color: '#1c1e21', marginBottom: '0.25rem', fontSize: '1.5rem' }}>Transcriptor y Resumidor</h1>
          <p style={{ textAlign: 'center', color: '#606770', marginBottom: '1.5rem', fontSize: '14px' }}>
            {isSignup ? 'Crea tu cuenta para empezar' : 'Inicia sesión para continuar'}
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', color: '#1c1e21', fontSize: '14px' }}>Correo electrónico</label>
            <input
              type="email"
              value={authEmail}
              onChange={e => setAuthEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              style={inputStyle}
              onKeyPress={onKeyEnter}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', color: '#1c1e21', fontSize: '14px' }}>Contraseña</label>
            <input
              type="password"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              placeholder="Contraseña"
              style={inputStyle}
              onKeyPress={onKeyEnter}
            />
          </div>

          {authError && (
            <p style={{ color: authError.includes('Revisa') || authError.includes('creada') ? '#36a420' : '#fa3e3e', marginBottom: '1rem', fontSize: '13px' }}>
              {authError}
            </p>
          )}

          <button
            onClick={isSignup ? handleSignUp : handleSignIn}
            disabled={authSubmitting || !authEmail || !authPassword}
            style={{
              width: '100%', backgroundColor: authSubmitting || !authEmail || !authPassword ? '#a0bdf5' : '#1877f2',
              color: 'white', border: 'none', padding: '12px', borderRadius: '6px',
              fontSize: '16px', cursor: authSubmitting ? 'not-allowed' : 'pointer', marginBottom: '1rem',
            }}
          >
            {authSubmitting ? 'Procesando...' : isSignup ? 'Crear Cuenta' : 'Iniciar Sesión'}
          </button>

          <p style={{ textAlign: 'center', fontSize: '14px', color: '#606770', margin: 0 }}>
            {isSignup ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
            <button
              onClick={() => { setAuthView(isSignup ? 'login' : 'signup'); setAuthError(''); }}
              style={{ background: 'none', border: 'none', color: '#1877f2', cursor: 'pointer', fontSize: '14px', textDecoration: 'underline', padding: 0 }}
            >
              {isSignup ? 'Inicia sesión' : 'Créala aquí'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div style={styles.container}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 style={{ ...styles.header, marginBottom: 0, textAlign: 'left' }}>Transcriptor y Resumidor</h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#606770' }}>{user.email}</span>
            <button
              style={{ ...styles.button, backgroundColor: '#606770', padding: '10px 15px' }}
              onClick={() => setShowSettingsModal(true)}
              title="Ajustes de Configuración"
            >
              ⚙️
            </button>
            <button style={styles.button} onClick={() => setIsModalOpen(true)}>Mejoras Permanentes</button>
            <button
              style={{ ...styles.button, backgroundColor: '#fa3e3e', padding: '10px 15px', fontSize: '14px' }}
              onClick={handleSignOut}
              title="Cerrar sesión"
            >
              Salir
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <h2>1. Sube tus archivos</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label htmlFor="file-upload" style={{ ...styles.button, cursor: 'pointer', flex: 1, textAlign: 'center' }}>
              Subir desde PC
            </label>
            <input
              id="file-upload"
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              multiple={true}
            />
            <button
              onClick={() => setShowDriveModal(true)}
              style={{ ...styles.button, ...styles.buttonGreen, flex: 1 }}
            >
              Procesar desde Google Drive
            </button>
          </div>
        </div>

        <p style={styles.status}>{status}</p>

        {fileQueue.length > 0 && (
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>2. Cola de Procesamiento ({fileQueue.length} archivos)</h2>
              <div>
                <button
                  onClick={handleProcessAll}
                  disabled={isLoading}
                  style={{ ...styles.button, ...styles.buttonGreen, ...(isLoading ? styles.buttonDisabled : {}) }}
                >
                  {isLoading ? 'Procesando...' : `Procesar Todos (${fileQueue.filter(f => f.status === 'pending').length})`}
                </button>
              </div>
            </div>
            <div style={styles.queueContainer}>
              {fileQueue.map((item) => (
                <div key={item.id}>
                  <div style={styles.queueItem}>
                    <span style={styles.queueItemName}>{item.displayName}</span>
                    <span style={{ ...styles.queueItemStatus, ...getStatusStyle(item.status) }}>
                      {item.status === 'error' ? 'Error' : item.status === 'completed' ? 'Completado' : item.status === 'processing' ? 'Procesando...' : 'Pendiente'}
                    </span>
                    <div>
                      <button
                        onClick={() => processSingleFile(item.id)}
                        disabled={isLoading || item.status === 'processing' || item.status === 'completed'}
                        style={{ ...styles.button, ...styles.buttonSmall, ...((isLoading || item.status === 'processing' || item.status === 'completed') ? styles.buttonDisabled : {}) }}
                      >
                        Procesar
                      </button>
                      <button
                        onClick={() => handleGenerateDocument(item)}
                        disabled={item.status !== 'completed'}
                        style={{ ...styles.button, ...styles.buttonSmall, ...styles.buttonGreen, ...(item.status !== 'completed' ? styles.buttonDisabled : {}) }}
                      >
                        Descargar
                      </button>
                      <button
                        onClick={() => setFileQueue(q => q.filter(i => i.id !== item.id))}
                        disabled={isLoading || item.status === 'processing'}
                        style={{ ...styles.button, ...styles.buttonSmall, backgroundColor: '#fa3e3e', ...((isLoading || item.status === 'processing') ? styles.buttonDisabled : {}) }}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>

                  {item.status === 'error' && item.errorMessage && (
                    <div style={{ ...styles.queueItem, borderTop: '1px dashed #fde7e7' }}>
                      {(item.errorMessage.includes('PROHIBITED_CONTENT') || item.errorMessage.includes('blocked')) ? (
                        <span style={styles.errorText}>
                          <strong>Contenido Prohibido:</strong> Google ha bloqueado este audio. Elimine este archivo.
                        </span>
                      ) : (
                        <span style={styles.errorText}>
                          <strong>Error:</strong> {item.errorMessage.substring(0, 200)}...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {fileQueue.some(item => item.status === 'completed') && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
                <h2>3. Exportar Lote</h2>
                <p>Descarga todos los resúmenes completados en un solo archivo .zip.</p>
                <button
                  onClick={handleDownloadZip}
                  style={{ ...styles.button, ...styles.buttonGreen }}
                  disabled={isLoading}
                >
                  {isLoading ? 'Generando Zip...' : 'Descargar Todo (.zip)'}
                </button>
              </div>
            )}
          </div>
        )}

        {showDriveModal && (
          <div style={styles.modalOverlay} onClick={() => setShowDriveModal(false)}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <h2>Procesar desde Google Drive</h2>
              <p>Pega tu lista de enlaces de Google Drive aquí (uno por línea).</p>
              <textarea
                style={{ ...styles.textarea, minHeight: '200px' }}
                placeholder="https...&#10;https...&#10;https..."
                value={driveLinks}
                onChange={(e) => setDriveLinks(e.target.value)}
              />
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button onClick={() => setShowDriveModal(false)} style={{ ...styles.button, backgroundColor: '#606770' }}>
                  Cancelar
                </button>
                <button
                  onClick={handleProcessDriveLinks}
                  style={{ ...styles.button, ...styles.buttonGreen }}
                  disabled={isLoading || driveLinks.length === 0}
                >
                  Añadir a la Cola
                </button>
              </div>
            </div>
          </div>
        )}

        {isModalOpen && (
          <div style={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <h2>Mejoras Permanentes</h2>
              <p>Estas instrucciones se aplicarán a TODOS los resúmenes de negocio futuros.</p>

              <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
                <input
                  type="file"
                  ref={importFileInputRef}
                  onChange={handleImportInstructions}
                  accept=".txt"
                  style={{ display: 'none' }}
                />
                <button onClick={() => importFileInputRef.current?.click()} style={{ ...styles.button, flex: 1, backgroundColor: '#42b72a' }}>
                  Importar desde Archivo
                </button>
                <button onClick={handleExportInstructions} style={{ ...styles.button, flex: 1 }}>
                  Exportar a Archivo
                </button>
              </div>

              <div style={{ margin: '1rem 0', display: 'flex' }}>
                <input
                  type="text"
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  placeholder="Añadir nueva instrucción permanente"
                  style={styles.modalInput}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && newInstruction && !globalInstructions.includes(newInstruction)) {
                      saveGlobalInstructions([...globalInstructions, newInstruction]);
                      setNewInstruction('');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (newInstruction && !globalInstructions.includes(newInstruction)) {
                      saveGlobalInstructions([...globalInstructions, newInstruction]);
                      setNewInstruction('');
                    }
                  }}
                  style={{ ...styles.button, ...styles.modalButton }}
                >
                  Añadir
                </button>
              </div>
              <div>
                {globalInstructions.length === 0 && <p>No hay instrucciones guardadas.</p>}
                {globalInstructions.map((inst, index) => (
                  <div key={index} style={styles.instructionItem}>
                    <span style={{ flex: 1, marginRight: '1rem' }}>{inst}</span>
                    <button
                      onClick={() => saveGlobalInstructions(globalInstructions.filter((_, i) => i !== index))}
                      style={styles.deleteButton}
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => setIsModalOpen(false)} style={{ ...styles.button, marginTop: '1rem' }}>Cerrar</button>
            </div>
          </div>
        )}

        {showSettingsModal && (
          <div style={styles.modalOverlay} onClick={() => setShowSettingsModal(false)}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <h2>⚙️ Ajustes de Configuración</h2>
              <p>Credenciales para el flujo de Google Drive (backend Render).</p>

              <div style={{ marginTop: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Gemini API Key</label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Introduce tu API Key de Gemini"
                  style={{ ...styles.modalInput, width: '100%' }}
                />
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>ID Carpeta Destino M4A</label>
                <input
                  type="text"
                  value={folderIdM4a}
                  onChange={(e) => setFolderIdM4a(e.target.value)}
                  placeholder="ID de la carpeta para audios (.m4a)"
                  style={{ ...styles.modalInput, width: '100%' }}
                />
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>ID Carpeta Destino TXT</label>
                <input
                  type="text"
                  value={folderIdTxt}
                  onChange={(e) => setFolderIdTxt(e.target.value)}
                  placeholder="ID de la carpeta para transcripciones (.txt)"
                  style={{ ...styles.modalInput, width: '100%' }}
                />
              </div>

              <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button onClick={() => setShowSettingsModal(false)} style={{ ...styles.button, backgroundColor: '#606770' }}>
                  Cancelar
                </button>
                <button onClick={saveSettings} style={{ ...styles.button, ...styles.buttonGreen }}>
                  Guardar Configuración
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- ================================== ---
// ---   FUNCIONES HELPER DEL BACKEND     ---
// --- ================================== ---

// Sube el archivo a Supabase Storage y llama a /api/transcribe
const runTranscription = async (
  file: File,
  userId: string,
  token: string
): Promise<{ transcription: string; fileName: string; transcriptionId: string | null }> => {
  // 1. Subir a Supabase Storage en carpeta del usuario
  const storagePath = `${userId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('audios')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Error subiendo archivo: ${uploadError.message}`);

  try {
    // 2. Llamar a /api/transcribe con la ruta del archivo
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Error del servidor en transcripción');
    }

    const data = await response.json();
    return {
      transcription: data.transcription ?? '',
      fileName: data.fileName ?? file.name,
      transcriptionId: data.transcriptionId ?? null,
    };
  } finally {
    // 3. Eliminar el audio del Storage (ya fue procesado)
    await supabase.storage.from('audios').remove([storagePath]);
  }
};

// Llama a /api/summarize-general con autenticación
const runGeneralSummary = async (transcription: string, token: string): Promise<string> => {
  const response = await fetch('/api/summarize-general', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ transcription }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Error del servidor en resumen general');
  }

  const data = await response.json();
  return data.summary ?? '';
};

// Llama a /api/summarize-business con autenticación
const runBusinessSummary = async (
  transcription: string,
  instructions: string[],
  token: string
): Promise<string> => {
  const response = await fetch('/api/summarize-business', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ transcription, instructions }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Error del servidor en resumen de negocio');
  }

  const data = await response.json();
  return data.summary ?? '';
};

// Flujo de Drive: llama al backend de Render (maneja OAuth de Google Drive)
const runTranscriptionFromDrive = async (
  driveFileId: string,
  instructions: string[],
  geminiApiKey: string,
  folderIdM4a: string,
  folderIdTxt: string
): Promise<{ transcription: string; fileName: string; generalSummary: string; businessSummary: string }> => {
  if (!geminiApiKey || !folderIdM4a || !folderIdTxt) {
    throw new Error("Faltan datos de configuración (API Key o IDs de Carpetas). Ve a Ajustes ⚙️.");
  }

  const response = await fetch('https://mjtranscripciones.onrender.com/transcribe-from-drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      drive_file_id: driveFileId,
      instructions,
      gemini_api_key: geminiApiKey,
      folder_id_m4a: folderIdM4a,
      folder_id_txt: folderIdTxt,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Error del servidor en transcripción de Drive');
  }

  const data = await response.json();
  return {
    transcription: data.transcription ?? '',
    fileName: data.fileName ?? `DriveFile_${driveFileId.slice(-4)}`,
    generalSummary: data.generalSummary ?? '',
    businessSummary: data.businessSummary ?? '',
  };
};

export default App;
