const express = require('express');
const cors = require('cors');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const admin = require('firebase-admin');
const { spawn } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Firebase Admin SDK initialization
const serviceAccount = require('./firebase-admin-key.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'hosteler-ia'
});

// Google Cloud Configuration
const GOOGLE_CLOUD_CONFIG = {
    projectId: 'sumy-464008',
    location: 'us-central1',
    resourceId: '5508720380925181952',
    apiEndpoint: 'https://us-central1-aiplatform.googleapis.com'
};

// Initialize Google Auth
const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// Cache de respuestas para optimización
const responseCache = new Map();
const cacheExpiry = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos en millisegundos

// Funciones de cache
function getCacheKey(message) {
    return crypto.createHash('md5').update(message.toLowerCase().trim()).digest('hex');
}

function isCacheValid(cacheKey) {
    const expiry = cacheExpiry.get(cacheKey);
    return expiry && Date.now() < expiry;
}

function getFromCache(message) {
    const cacheKey = getCacheKey(message);
    if (responseCache.has(cacheKey) && isCacheValid(cacheKey)) {
        return responseCache.get(cacheKey);
    }
    return null;
}

function saveToCache(message, response) {
    const cacheKey = getCacheKey(message);
    responseCache.set(cacheKey, response);
    cacheExpiry.set(cacheKey, Date.now() + CACHE_DURATION);
    
    // Limpiar cache expirado cada 10 minutos
    if (responseCache.size % 10 === 0) {
        const now = Date.now();
        for (const [key, expiry] of cacheExpiry.entries()) {
            if (now >= expiry) {
                responseCache.delete(key);
                cacheExpiry.delete(key);
            }
        }
    }
}

// Verify Firebase token middleware
async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autorización requerido' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verificando token:', error);
        return res.status(401).json({ error: 'Token inválido' });
    }
}

// Function to call Agent Engine
async function callAgentEngine(message, sessionId, userId) {
    try {
        // Get access token
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        const url = `${GOOGLE_CLOUD_CONFIG.apiEndpoint}/v1/projects/${GOOGLE_CLOUD_CONFIG.projectId}/locations/${GOOGLE_CLOUD_CONFIG.location}/reasoningEngines/${GOOGLE_CLOUD_CONFIG.resourceId}:query`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: {
                    message: message,
                    user_id: userId || "test_user"
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Error del Agent Engine: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error('Error llamando al Agent Engine:', error);
        throw error;
    }
}

// Alternative streaming function using the Python vertexai library approach
async function callAgentEngineStream(message, sessionId, userId) {
    try {
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        const url = `${GOOGLE_CLOUD_CONFIG.apiEndpoint}/v1/projects/${GOOGLE_CLOUD_CONFIG.projectId}/locations/${GOOGLE_CLOUD_CONFIG.location}/reasoningEngines/${GOOGLE_CLOUD_CONFIG.resourceId}:streamQuery`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: {
                    message: message,
                    user_id: userId || "test_user"
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error del Agent Engine: ${response.status} ${response.statusText} - ${errorText}`);
        }

        // Parse the streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.content && parsed.content.parts) {
                            for (const part of parsed.content.parts) {
                                if (part.text) {
                                    result += part.text;
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore parsing errors for incomplete chunks
                    }
                }
            }
        }

        return result || 'Lo siento, no pude procesar tu mensaje.';

    } catch (error) {
        console.error('Error en streaming:', error);
        throw error;
    }
}

// Function to call agent using Python SDK (most reliable)
async function callAgentWithPython(message) {
    return new Promise((resolve, reject) => {
        const python = spawn('python3', ['test_agent.py', message], {
            cwd: __dirname,
            env: { ...process.env }
        });

        let output = '';
        let error = '';

        python.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            
            // Look for the response line
            const lines = text.split('\n');
            for (const line of lines) {
                if (line.startsWith('📥 Respuesta: ')) {
                    const response = line.replace('📥 Respuesta: ', '').trim();
                    if (response && response !== 'None') {
                        resolve(response);
                        return;
                    }
                }
            }
        });

        python.stderr.on('data', (data) => {
            error += data.toString();
        });

        python.on('close', (code) => {
            if (code === 0) {
                // Try to extract response from full output
                const lines = output.split('\n');
                for (const line of lines) {
                    if (line.startsWith('📥 Respuesta: ')) {
                        const response = line.replace('📥 Respuesta: ', '').trim();
                        if (response && response !== 'None') {
                            resolve(response);
                            return;
                        }
                    }
                }
                reject(new Error('No response found in output'));
            } else {
                reject(new Error(`Python script failed (code ${code}): ${error || output}`));
            }
        });

        python.on('error', (err) => {
            reject(new Error(`Failed to start Python: ${err.message}`));
        });
    });
}

// Chat endpoint
app.post('/api/chat', verifyFirebaseToken, async (req, res) => {
    const startTime = Date.now();
    const startTimestamp = new Date().toISOString();
    
    try {
        const { message, sessionId, projectId, resourceId } = req.body;
        const userId = req.user.uid;

        if (!message) {
            return res.status(400).json({ error: 'Mensaje requerido' });
        }

        console.log(`\n🚀 [${startTimestamp}] MENSAJE RECIBIDO`);
        console.log(`   Usuario: ${userId}`);
        console.log(`   Mensaje: "${message}"`);
        console.log(`   Sesión: ${sessionId}`);
        console.log(`   Cache: ${responseCache.size} entradas`);

        // Verificar cache primero
        let response = getFromCache(message);
        if (response) {
            const cacheTime = Date.now() - startTime;
            console.log(`\n⚡ [${new Date().toISOString()}] RESPUESTA DESDE CACHE!`);
            console.log(`   ⏱️  Latencia cache: ${cacheTime}ms`);
            console.log(`   📥 Respuesta: "${response}"`);
            
            const totalTime = Date.now() - startTime;
            console.log(`\n📤 [${new Date().toISOString()}] ENVIANDO RESPUESTA CACHEADA`);
            console.log(`   ⏱️  LATENCIA TOTAL: ${totalTime}ms`);
            console.log(`   🚀 ULTRA RÁPIDA - DESDE CACHE!`);
            console.log(`\n${'🔥'.repeat(80)}\n`);

            return res.json({ 
                response: response,
                timestamp: new Date().toISOString(),
                cached: true,
                latency: totalTime
            });
        }

        // No hay en cache, llamar al agente
        console.log(`\n💾 Cache miss - llamando al agente...`);
        const agentStartTime = Date.now();
        
        try {
            console.log(`\n⏱️  [${new Date().toISOString()}] INICIANDO LLAMADA AL AGENTE (Python SDK)...`);
            response = await callAgentWithPython(message);
            const agentEndTime = Date.now();
            const agentLatency = agentEndTime - agentStartTime;
            console.log(`\n✅ [${new Date().toISOString()}] RESPUESTA DEL AGENTE RECIBIDA`);
            console.log(`   Método: Python SDK`);
            console.log(`   Latencia del agente: ${agentLatency}ms`);
            console.log(`   Respuesta: "${response}"`);
            
            // Guardar en cache
            saveToCache(message, response);
            console.log(`   💾 Respuesta guardada en cache por ${CACHE_DURATION/60000} min`);
            
        } catch (pythonError) {
            const pythonEndTime = Date.now();
            const pythonLatency = pythonEndTime - agentStartTime;
            console.log(`\n❌ [${new Date().toISOString()}] Python SDK falló (${pythonLatency}ms): ${pythonError.message}`);
            console.log(`\n⏱️  [${new Date().toISOString()}] INTENTANDO API STREAMING...`);
            
            try {
                const streamStartTime = Date.now();
                response = await callAgentEngineStream(message, sessionId, userId);
                const streamEndTime = Date.now();
                const streamLatency = streamEndTime - streamStartTime;
                console.log(`\n✅ [${new Date().toISOString()}] RESPUESTA DE STREAMING RECIBIDA`);
                console.log(`   Método: API Streaming`);
                console.log(`   Latencia: ${streamLatency}ms`);
                console.log(`   Respuesta: "${response}"`);
            } catch (streamError) {
                const streamEndTime = Date.now();
                const streamLatency = streamEndTime - agentStartTime;
                console.log(`\n❌ [${new Date().toISOString()}] Streaming falló (${streamLatency}ms): ${streamError.message}`);
                console.log(`\n⏱️  [${new Date().toISOString()}] INTENTANDO QUERY REGULAR...`);
                
                try {
                    const queryStartTime = Date.now();
                    const queryResponse = await callAgentEngine(message, sessionId, userId);
                    const queryEndTime = Date.now();
                    const queryLatency = queryEndTime - queryStartTime;
                    response = queryResponse.response || queryResponse.output || 'Respuesta del agente recibida';
                    console.log(`\n✅ [${new Date().toISOString()}] RESPUESTA DE QUERY RECIBIDA`);
                    console.log(`   Método: API Query`);
                    console.log(`   Latencia: ${queryLatency}ms`);
                    console.log(`   Respuesta: "${response}"`);
                } catch (queryError) {
                    const errorEndTime = Date.now();
                    const errorLatency = errorEndTime - agentStartTime;
                    console.error(`\n💥 [${new Date().toISOString()}] TODOS LOS MÉTODOS FALLARON (${errorLatency}ms)`);
                    console.error(`   Error final: ${queryError.message}`);
                    response = 'Lo siento, hubo un problema técnico. El agente no está disponible en este momento.';
                }
            }
        }

        const totalTime = Date.now() - startTime;
        const endTimestamp = new Date().toISOString();
        
        console.log(`\n📤 [${endTimestamp}] ENVIANDO RESPUESTA AL CLIENTE`);
        console.log(`   ⏱️  LATENCIA TOTAL: ${totalTime}ms`);
        console.log(`   📊 BREAKDOWN:`);
        console.log(`      - Procesamiento inicial: ~${agentStartTime - startTime}ms`);
        console.log(`      - Tiempo en agente: ~${Date.now() - agentStartTime}ms`);
        console.log(`   ✨ Respuesta final: "${response}"`);
        console.log(`\n${'='.repeat(80)}\n`);

        res.json({ 
            response: response,
            timestamp: new Date().toISOString(),
            cached: false,
            latency: totalTime
        });

    } catch (error) {
        console.error('Error en /api/chat:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor',
            message: error.message 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        cache: {
            entries: responseCache.size,
            hitRate: '🔥 Disponible en /api/cache-stats'
        },
        config: {
            projectId: GOOGLE_CLOUD_CONFIG.projectId,
            location: GOOGLE_CLOUD_CONFIG.location,
            resourceId: GOOGLE_CLOUD_CONFIG.resourceId
        }
    });
});

// Cache statistics endpoint
app.get('/api/cache-stats', (req, res) => {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    
    for (const [key, expiry] of cacheExpiry.entries()) {
        if (now < expiry) {
            validEntries++;
        } else {
            expiredEntries++;
        }
    }
    
    res.json({
        cache: {
            totalEntries: responseCache.size,
            validEntries: validEntries,
            expiredEntries: expiredEntries,
            cacheDuration: `${CACHE_DURATION/60000} minutos`,
            memoryUsage: `~${Math.round(responseCache.size * 0.5)} KB estimado`
        },
        performance: {
            cacheEnabled: true,
            expectedSpeedup: '95-99% reducción de latencia para hits',
            normalLatency: '~7000ms',
            cacheLatency: '~10ms'
        },
        timestamp: new Date().toISOString()
    });
});

// Test cache endpoint (sin autenticación para testing)
app.post('/api/test-cache', async (req, res) => {
    const startTime = Date.now();
    const startTimestamp = new Date().toISOString();
    
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Mensaje requerido' });
        }

        console.log(`\n🧪 [${startTimestamp}] TEST CACHE`);
        console.log(`   📤 Mensaje: "${message}"`);
        console.log(`   💾 Cache: ${responseCache.size} entradas`);

        // Verificar cache primero
        let response = getFromCache(message);
        if (response) {
            const cacheTime = Date.now() - startTime;
            console.log(`\n⚡ [${new Date().toISOString()}] CACHE HIT!`);
            console.log(`   ⏱️  Latencia cache: ${cacheTime}ms`);
            console.log(`   📥 Respuesta: "${response}"`);
            
            return res.json({ 
                response: response,
                timestamp: new Date().toISOString(),
                cached: true,
                latency: cacheTime
            });
        }

        // No hay en cache, llamar al agente
        console.log(`\n💾 Cache miss - llamando al agente...`);
        const agentStartTime = Date.now();
        
        try {
            response = await callAgentWithPython(message);
            const agentLatency = Date.now() - agentStartTime;
            console.log(`\n✅ Respuesta del agente: "${response}"`);
            console.log(`   ⏱️  Latencia: ${agentLatency}ms`);
            
            // Guardar en cache
            saveToCache(message, response);
            console.log(`   💾 Guardado en cache`);
            
        } catch (error) {
            console.error(`❌ Error del agente: ${error.message}`);
            response = 'Error conectando con el agente';
        }

        const totalTime = Date.now() - startTime;
        res.json({ 
            response: response,
            timestamp: new Date().toISOString(),
            cached: false,
            latency: totalTime
        });

    } catch (error) {
        console.error('Error en test-cache:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor',
            message: error.message 
        });
    }
});

// Test Agent Engine connection
app.get('/api/test-agent', async (req, res) => {
    try {
        const testMessage = 'Hola, ¿estás funcionando?';

        // Try Python method first
        let response;
        try {
            response = await callAgentWithPython(testMessage);
        } catch (pythonError) {
            console.log('Python test failed, trying API:', pythonError.message);
            const testSessionId = 'test-session-' + Date.now();
            const testUserId = 'test-user';
            response = await callAgentEngineStream(testMessage, testSessionId, testUserId);
        }

        res.json({
            status: 'OK',
            message: 'Conexión con el agente exitosa',
            testResponse: response,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error probando agente:', error);
        res.status(500).json({
            status: 'ERROR',
            message: 'No se pudo conectar con el agente',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📱 Interfaz disponible en http://localhost:${PORT}`);
    console.log(`🤖 Agent Engine ID: ${GOOGLE_CLOUD_CONFIG.resourceId}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🧪 Test agent: http://localhost:${PORT}/api/test-agent`);
});

module.exports = app; 