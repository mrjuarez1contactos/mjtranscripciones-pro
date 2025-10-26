# Transcriptor y Resumidor de Audio

Esta es la aplicación que hemos construido juntos. Sigue estas instrucciones para ejecutarla en tu propia computadora y probarla en tu dispositivo móvil.

## Requisitos Previos

Necesitas tener [Node.js](https://nodejs.org/) instalado en tu computadora. Por favor, descarga e instala la versión **LTS**.

## Pasos para la Instalación

1.  **Crea una carpeta para el proyecto:** En tu computadora, crea una nueva carpeta. Por ejemplo, llámala `mi-transcriptor`.

2.  **Copia los archivos:** Coloca todos los archivos que te proporcioné (`package.json`, `vite.config.ts`, `index.html`, etc.) dentro de esta carpeta. Asegúrate de crear también la subcarpeta `src` y poner los archivos correspondientes dentro de ella.

3.  **Crea tu archivo de entorno (`.env`):**
    *   Dentro de la carpeta principal (`mi-transcriptor`), crea un nuevo archivo de texto y nómbralo exactamente `.env`.
    *   Abre este archivo y añade la siguiente línea, reemplazando `TU_CLAVE_DE_API_DE_GEMINI` con tu clave real:
        ```
        VITE_API_KEY=TU_CLAVE_DE_API_DE_GEMINI
        ```
    *   Este archivo es secreto y no debes compartirlo. El prefijo `VITE_` es **muy importante**.

4.  **Abre una terminal:**
    *   **En Windows:** Ve a la carpeta, haz clic derecho y selecciona "Abrir en Terminal" o "Abrir PowerShell aquí".
    *   **En Mac:** Abre la aplicación "Terminal" y escribe `cd ` (con un espacio al final), luego arrastra la carpeta del proyecto a la ventana de la terminal y presiona Enter.

5.  **Instala las dependencias:**
    *   En la terminal, escribe el siguiente comando y presiona Enter. Esto descargará todas las herramientas que la aplicación necesita. Solo necesitas hacerlo una vez.
        ```bash
        npm install
        ```

6.  **¡Ejecuta la aplicación!**
    *   Ahora, escribe este comando y presiona Enter:
        ```bash
        npm run dev
        ```

## Accede a la Aplicación

Una vez que ejecutes `npm run dev`, la terminal te mostrará unas direcciones URL:

*   **Local:** `http://localhost:5173/` - Abre esta dirección en el navegador de tu computadora para usar la aplicación.
*   **Network:** `http://192.168.X.X:5173/` - **Esta es la que usarás en tu móvil.** Asegúrate de que tu móvil y tu computadora estén en la misma red Wi-Fi y escribe esta dirección en el navegador de tu móvil.

¡Y listo! Ya tienes la aplicación funcionando.

## Para seguir mejorando

Cuando quieras hacer cambios, solo pídemelo. Te daré el contenido actualizado de los archivos que necesites cambiar (por ejemplo, `src/App.tsx`). Simplemente reemplaza el contenido del archivo en tu computadora con el nuevo que te dé. Si detuviste la aplicación, solo necesitas volver a ejecutar `npm run dev` para ver los cambios.