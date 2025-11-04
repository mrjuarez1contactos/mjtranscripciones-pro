# Transcriptor y Resumidor de Audio

Esta es la aplicación que hemos construido juntos. Sigue estas instrucciones para ejecutarla en tu propia computadora y tener una versión estable y funcional para tu trabajo diario.

## Requisitos Previos

Necesitas tener [Node.js](https://nodejs.org/) instalado en tu computadora. Por favor, descarga e instala la versión **LTS**.

## Pasos para la Instalación (Se hace una sola vez)

1.  **Crea una carpeta para el proyecto:** En tu computadora, crea una nueva carpeta. Por ejemplo, llámala `mi-transcriptor`.

2.  **Copia los archivos:** Coloca todos los archivos que te proporcioné (`package.json`, `vite.config.ts`, `index.html`, etc.) dentro de esta carpeta. Asegúrate de crear también la subcarpeta `src` y poner los archivos correspondientes dentro de ella.

3.  **Crea tu archivo de clave de API (El paso más importante):**
    *   Dentro de la carpeta principal (`mi-transcriptor`), crea un nuevo archivo de texto y nómbralo exactamente `.env` (punto env).
    *   Abre este archivo y añade la siguiente línea, reemplazando `TU_CLAVE_DE_API_DE_GEMINI` con tu clave real:
        ```
        VITE_API_KEY=TU_CLAVE_DE_API_DE_GEMINI
        ```
    *   **Importante:** El nombre debe ser `VITE_API_KEY`. El prefijo `VITE_` es crucial para que la aplicación funcione en tu computadora. Este fue el error que causó los problemas anteriores y ya ha sido corregido en el código.

4.  **Abre una terminal:**
    *   **En Windows:** Ve a la carpeta, haz clic derecho y selecciona "Abrir en Terminal" o "Abrir PowerShell aquí".
    *   **En Mac:** Abre la aplicación "Terminal" y escribe `cd ` (con un espacio al final), luego arrastra la carpeta del proyecto a la ventana de la terminal y presiona Enter.

5.  **Instala las dependencias:**
    *   En la terminal, escribe el siguiente comando y presiona Enter. Esto descargará todas las herramientas que la aplicación necesita. Puede tardar unos minutos.
        ```bash
        npm install
        ```

6.  **¡Ejecuta tu aplicación!**
    *   Ahora, escribe este comando y presiona Enter:
        ```bash
        npm run dev
        ```

## Accede a la Aplicación (Uso diario)

Una vez que ejecutes `npm run dev`, la terminal te mostrará unas direcciones URL:

*   **Local:** `http://localhost:5173/` - Abre esta dirección en el navegador de tu computadora para usar la aplicación.
*   **Network:** `http://192.1G.X.X:5173/` - **Esta es la que usarás en tu móvil.** Asegúrate de que tu móvil y tu computadora estén en la misma red Wi-Fi y escribe esta dirección en el navegador de tu móvil.

¡Y listo! Ya tienes tu aplicación de trabajo estable y funcionando. Cuando termines de usarla, simplemente cierra la ventana de la terminal. Para volver a usarla, solo tienes que repetir el paso 6.
