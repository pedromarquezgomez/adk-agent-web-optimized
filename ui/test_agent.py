#!/usr/bin/env python3
"""
Script optimizado para ADK Agent Engine con:
- Reutilización de sesiones
- Conexión persistente  
- Cache de respuestas
"""

import os
import sys
import time
import json
import hashlib
import vertexai
from vertexai import agent_engines

# Configuración
PROJECT_ID = 'sumy-464008'
LOCATION = 'us-central1'
RESOURCE_ID = '5508720380925181952'

# Variables globales para conexión persistente
_app = None
_session_id = None
_response_cache = {}
_cache_expiry = {}
CACHE_DURATION = 300  # 5 minutos en segundos

def get_cache_key(message):
    """Generar clave de cache para el mensaje"""
    return hashlib.md5(message.lower().strip().encode()).hexdigest()

def is_cache_valid(cache_key):
    """Verificar si el cache sigue siendo válido"""
    if cache_key not in _cache_expiry:
        return False
    return time.time() < _cache_expiry[cache_key]

def initialize_agent():
    """Inicializar agente solo una vez"""
    global _app, _session_id
    
    if _app is not None:
        print("🔄 Reutilizando conexión existente al agente")
        return _app, _session_id
    
    init_start = time.time()
    print("🚀 Inicializando conexión persistente...")
    
    # Configurar entorno
    os.environ['GOOGLE_CLOUD_PROJECT'] = PROJECT_ID
    
    # Inicializar Vertex AI
    vertexai.init(
        project=PROJECT_ID,
        location=LOCATION,
        staging_bucket="gs://sumy-agent-staging"
    )
    init_end = time.time()
    print(f"⏱️  Inicialización Vertex AI: {(init_end - init_start) * 1000:.1f}ms")
    
    # Obtener el agente (solo una vez)
    agent_start = time.time()
    _app = agent_engines.get(RESOURCE_ID)
    agent_end = time.time()
    print(f"✅ Agente conectado ({(agent_end - agent_start) * 1000:.1f}ms)")
    
    # Crear sesión persistente (solo una vez)
    session_start = time.time()
    session = _app.create_session(user_id="persistent_user")
    _session_id = session['id']
    session_end = time.time()
    print(f"✅ Sesión persistente creada: {_session_id} ({(session_end - session_start) * 1000:.1f}ms)")
    
    total_init = (session_end - init_start) * 1000
    print(f"🎯 INICIALIZACIÓN TOTAL: {total_init:.1f}ms")
    
    return _app, _session_id

def query_agent_optimized(message):
    """Query optimizado con cache y reutilización"""
    start_time = time.time()
    
    # Verificar cache primero
    cache_key = get_cache_key(message)
    if cache_key in _response_cache and is_cache_valid(cache_key):
        cache_time = time.time() - start_time
        print(f"⚡ RESPUESTA DESDE CACHE ({cache_time * 1000:.1f}ms)")
        print(f"📥 Cache hit: {_response_cache[cache_key]}")
        return _response_cache[cache_key]
    
    # Obtener agente y sesión (reutilizados)
    app, session_id = initialize_agent()
    
    # Enviar mensaje
    print(f"📤 Enviando: {message}")
    query_start = time.time()
    response_text = ""
    event_count = 0
    
    for event in app.stream_query(
        user_id="persistent_user",
        session_id=session_id,
        message=message
    ):
        event_count += 1
        if event_count == 1:
            first_event_time = time.time()
            print(f"⚡ Primer evento: {(first_event_time - query_start) * 1000:.1f}ms")
        
        # El evento es un diccionario
        if isinstance(event, dict) and 'content' in event:
            content = event['content']
            if 'parts' in content:
                for part in content['parts']:
                    if 'text' in part:
                        response_text += part['text']
    
    query_end = time.time()
    query_time = (query_end - query_start) * 1000
    total_time = (query_end - start_time) * 1000
    
    # Guardar en cache
    _response_cache[cache_key] = response_text
    _cache_expiry[cache_key] = time.time() + CACHE_DURATION
    
    print(f"📥 Respuesta: {response_text}")
    print(f"⏱️  DETALLES OPTIMIZADOS:")
    print(f"   - Solo query: {query_time:.1f}ms")
    print(f"   - Eventos: {event_count}")
    print(f"   - Total: {total_time:.1f}ms")
    print(f"   - Cache guardado por {CACHE_DURATION}s")
    
    return response_text

def test_agent_connection(message="Hola, ¿estás funcionando?"):
    """Función principal optimizada"""
    try:
        response = query_agent_optimized(message)
        return response
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return None

if __name__ == "__main__":
    message = sys.argv[1] if len(sys.argv) > 1 else "Hola, ¿estás funcionando?"
    
    print(f"🚀 MODO OPTIMIZADO ACTIVADO")
    print(f"📊 Cache: {len(_response_cache)} entradas")
    print(f"🔄 Sesión persistente: {'Sí' if _session_id else 'No'}")
    print("-" * 50)
    
    result = test_agent_connection(message)
    
    if result:
        print(f"\n🎉 ¡Éxito optimizado!")
        print(f"Respuesta: {result}")
    else:
        print(f"\n💥 Error en conexión")
        sys.exit(1) 