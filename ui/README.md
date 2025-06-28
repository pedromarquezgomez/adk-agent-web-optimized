# 🤖 ADK Short Bot - Interfaz Web

Una interfaz web moderna con Firebase para conectarse al ADK Agent Engine desplegado en Google Cloud.

## ✨ Características

- 🔐 **Autenticación con Google** via Firebase Auth
- 💬 **Chat en tiempo real** con el ADK Agent
- 🗄️ **Historial persistente** en Firestore
- 📱 **Diseño responsive** para móvil y desktop
- 🚀 **Deployment automático** con Firebase Hosting

## 🛠️ Configuración Inicial

### 1. Prerequisitos

- Node.js 18+ 
- Firebase CLI instalado (`npm install -g firebase-tools`)
- Proyecto de Firebase creado
- ADK Agent desplegado en Google Cloud

### 2. Crear Proyecto Firebase

```bash
# Crear nuevo proyecto en Firebase Console
# https://console.firebase.google.com

# Habilitar servicios necesarios:
# - Authentication (Google provider)
# - Firestore Database
# - Hosting
```

### 3. Configurar Firebase en local

```bash
# Instalar dependencias
npm install

# Login a Firebase
firebase login

# Inicializar proyecto (opcional si ya tienes firebase.json)
firebase init

# Seleccionar:
# ✅ Firestore
# ✅ Functions
# ✅ Hosting
# ✅ Authentication
```

### 4. Configurar variables de entorno

#### A. Firebase Config (Cliente)
1. Copia `firebase-config.example.js` como `firebase-config.js`
2. Ve a Firebase Console > Project Settings > General
3. Copia tu config y actualiza el archivo

#### B. Firebase Admin Key (Servidor)
1. Ve a Firebase Console > Project Settings > Service Accounts
2. Genera una nueva clave privada
3. Guarda como `firebase-admin-key.json`

#### C. Google Cloud Credentials
```bash
# Autenticar con Google Cloud
gcloud auth application-default login

# O usar service account key
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"
```

## 🚀 Desarrollo Local

```bash
# Instalar dependencias
npm install

# Ejecutar servidor de desarrollo
npm run dev

# La app estará disponible en:
# http://localhost:3000
```

### Endpoints de desarrollo:
- `http://localhost:3000` - Interfaz principal
- `http://localhost:3000/api/health` - Health check
- `http://localhost:3000/api/test-agent` - Probar conexión con agente

## 📦 Deployment a Firebase

### 1. Deployment manual

```bash
# Build y deploy
npm run deploy

# Solo hosting
firebase deploy --only hosting

# Solo functions
firebase deploy --only functions
```

### 2. Configurar CI/CD (GitHub Actions)

Crea `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Firebase
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm install
      - run: firebase deploy --token ${{ secrets.FIREBASE_TOKEN }}
```

## 🔧 Configuración del Agent Engine

Actualiza en `server.js` la configuración de tu agente:

```javascript
const GOOGLE_CLOUD_CONFIG = {
    projectId: 'tu-proyecto-id',          // sumy-464008
    location: 'us-central1',              // tu región
    resourceId: 'tu-reasoning-engine-id', // 5508720380925181952
    apiEndpoint: 'https://us-central1-aiplatform.googleapis.com'
};
```

## 📱 Uso de la Aplicación

### 1. Autenticación
- Los usuarios se autentican con Google
- Cada usuario tiene su propio historial de chat

### 2. Chat
- Envía mensajes al ADK Agent
- Recibe respuestas en tiempo real
- El historial se guarda automáticamente

### 3. Funcionalidades del Agent
- **Acortar mensajes**: "Acorta este texto: [tu mensaje]"
- **Consultar BD**: "Busca a Pedro Martinez"
- **Consultas específicas**: "Muestra usuarios del departamento IT"

## 🗂️ Estructura del Proyecto

```
ui/
├── index.html              # Interfaz principal React
├── styles.css              # Estilos CSS modernos
├── server.js               # Servidor Node.js/Express
├── package.json            # Dependencias npm
├── firebase.json           # Configuración Firebase
├── firestore.rules         # Reglas de seguridad
├── firebase-config.example.js  # Ejemplo config cliente
└── README.md               # Esta documentación
```

## 🔒 Seguridad

### Firestore Rules
```javascript
// Solo usuarios autenticados pueden acceder a sus datos
match /messages/{messageId} {
  allow read, write: if request.auth.uid == resource.data.userId;
}
```

### API Authentication
- Todas las llamadas al API requieren Firebase ID Token
- El servidor verifica tokens automáticamente

## 🐛 Troubleshooting

### Error: "Agent Engine not found"
- Verifica que el `resourceId` sea correcto
- Asegúrate que el agente esté desplegado

### Error: "Authentication failed"
- Verifica que `firebase-admin-key.json` esté configurado
- Revisa que Google Cloud auth esté activo

### Error: "CORS issues"
- Asegúrate que el servidor esté corriendo en desarrollo
- Verifica configuración de Firebase Hosting

### Chat no funciona
1. Verifica conexión a internet
2. Abre Developer Tools > Console para ver errores
3. Prueba endpoint `/api/test-agent`

## 📚 Recursos

- [Firebase Documentation](https://firebase.google.com/docs)
- [Google Cloud Agent Engines](https://cloud.google.com/vertex-ai/docs/reasoning-engines)
- [React Documentation](https://react.dev/)

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📄 Licencia

MIT License - ve `LICENSE` para detalles.

---

¡Tu ADK Short Bot está listo para usar! 🎉 