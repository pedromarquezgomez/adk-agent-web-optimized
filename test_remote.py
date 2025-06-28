import vertexai
from vertexai import agent_engines
from dotenv import load_dotenv
import os

# Cargar variables de entorno
load_dotenv()

# Configurar Vertex AI
vertexai.init(
    project="sumy-464008",
    location="us-central1",
    staging_bucket="gs://sumy-agent-staging"
)

# Conectar al agente remoto
remote_agent = agent_engines.get("5508720380925181952")

# Crear sesión
session = remote_agent.create_session(user_id="test_user")
print(f"Session ID: {session['id']}")

# Probar conexión
print("Probando conexión...")
for event in remote_agent.stream_query(
    user_id="test_user",
    session_id=session['id'],
    message="Hola, ¿estás funcionando?"
):
    print(event)