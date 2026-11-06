# Instalación

## Requisitos

- **Windows** (el túnel de Cloudflare y el arranque con `.bat` están pensados para Windows).
- **Node.js** LTS reciente. Verifica con `node -v`.
- **Google Chrome o Microsoft Edge** instalado: la librería de WhatsApp lo usa para abrir WhatsApp Web.
- Conexión a internet para cargar Tailwind CSS, Font Awesome y las fuentes (se cargan por CDN) y para usar WhatsApp.

## 1. Obtener el proyecto

```bash
git clone <URL-DE-TU-REPOSITORIO>
cd <carpeta-del-proyecto>
```

## 2. Instalar dependencias

```bash
npm install
```

Esto instala `whatsapp-web.js` y `qrcode`. La primera vez puede tardar porque descarga un navegador de apoyo.

## 3. Arrancar el servidor

Cualquiera de estas dos formas:

```bash
npm start
```

o doble clic en `INICIAR_SERVIDOR.bat`, que además abre el navegador en `http://localhost:3000`.

Puerto distinto: define la variable `PORT` antes de arrancar (por defecto es `3000`).

```powershell
$env:PORT = 4000; npm start
```

## 4. Usar la aplicación

| Dirección | Función |
|-----------|---------|
| `http://localhost:3000/` | Aplicación principal |
| `http://localhost:3000/menu.html` | Menú digital del cliente |
| `http://localhost:3000/admin.html` | Consola de administración |

En la pantalla de ingreso escribe el **usuario del negocio**, elige el **rol** (Dueño, Cajero o Cocina) y escribe la clave de ese rol. Las credenciales de demostración están en `database.json` y en la carpeta `db/`.

## 5. Conectar WhatsApp

1. Entra como **Dueño** y abre la pestaña **WhatsApp**.
2. Pulsa conectar: el sistema genera un **código QR**.
3. En el celular del negocio abre WhatsApp → **Dispositivos vinculados** → **Vincular un dispositivo** y escanea el QR.
4. Cuando el estado cambie a conectado, los mensajes que lleguen a ese número serán atendidos por el bot y los pedidos aparecerán en la cocina.

La sesión queda guardada en la carpeta temporal del sistema, así no hay que escanear el QR en cada arranque. Si algo falla, desconecta y vuelve a conectar con la opción de reiniciar sesión.

## 6. Menú digital desde datos móviles (opcional)

Para que el cliente abra el menú digital fuera de tu Wi-Fi, el servidor descarga y usa `cloudflared` (túnel de Cloudflare) la primera vez que arranca. Eso genera un enlace público temporal que el bot envía por WhatsApp. Si no hay internet o el túnel falla, el sistema sigue funcionando en la red local.

## Solución de problemas

| Problema | Qué revisar |
|----------|-------------|
| `Cannot find module 'whatsapp-web.js'` | Falta ejecutar `npm install` |
| No aparece el código QR | Verifica que Chrome o Edge estén instalados y que el servidor muestre el mensaje de WhatsApp al arrancar |
| El celular no abre la aplicación | Debe estar en el mismo Wi-Fi; usa la IP que muestra la terminal y revisa el firewall de Windows (puerto 3000) |
| El puerto 3000 está ocupado | Cierra el otro proceso o arranca con otro `PORT` |
| Cambié datos y no se ven | Los datos viven en `database.json` y `db/<ID>.json`; reinicia el servidor si editaste los archivos a mano |

## Antes de subir a GitHub

- No subas `node_modules/`, `.wwebjs_auth/` ni `.wwebjs_cache/`. Ya están en el `.gitignore`. La carpeta `.wwebjs_auth/` contiene la sesión de WhatsApp y permitiría a otra persona usar esa cuenta.
- Revisa `database.json` y `db/`: contienen teléfonos y nombres de clientes de prueba. Si son reales, anonimízalos (Ley 1581 de 2012).
