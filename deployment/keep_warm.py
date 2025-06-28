#!/usr/bin/env python3
"""
Script para mantener el Reasoning Engine cálido y evitar cold starts.
Envía mensajes de ping periódicos para mantener las instancias activas.
"""

import os
import time
import schedule
import vertexai
from dotenv import load_dotenv
from vertexai import agent_engines
from datetime import datetime
import logging

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ReasoningEngineWarmer:
    def __init__(self):
        load_dotenv()
        
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        self.location = os.getenv("GOOGLE_CLOUD_LOCATION")
        self.bucket = os.getenv("GOOGLE_CLOUD_STAGING_BUCKET")
        self.resource_id = "5508720380925181952"  # Tu resource ID
        
        if not all([self.project_id, self.location, self.bucket]):
            raise ValueError("Missing required environment variables")
            
        vertexai.init(
            project=self.project_id,
            location=self.location,
            staging_bucket=self.bucket,
        )
        
        self.remote_app = agent_engines.get(self.resource_id)
        logger.info(f"✅ Warmer iniciado para {self.resource_id}")
    
    def ping_engine(self):
        """Envía un ping ligero al Reasoning Engine"""
        try:
            start_time = time.time()
            
            # Mensaje muy simple para minimizar costo y tiempo
            ping_messages = [
                "ping",
                "test",
                "¿estás activo?",
                "status check"
            ]
            
            # Rotar mensajes para evitar patrones
            current_minute = datetime.now().minute
            message = ping_messages[current_minute % len(ping_messages)]
            
            logger.info(f"🏃 Enviando ping: '{message}'")
            
            # Usar query simple (no streaming para ser más rápido)
            for event in self.remote_app.stream_query(
                user_id="warmer_bot",
                session_id="keep_warm_session", 
                message=message,
            ):
                # Solo procesar el primer evento para el ping
                break
                
            latency = (time.time() - start_time) * 1000
            logger.info(f"✅ Ping exitoso - Latencia: {latency:.0f}ms")
            
            # Log cada 10 pings para no saturar
            if current_minute % 10 == 0:
                logger.info(f"🔥 Engine mantenido cálido - {datetime.now().strftime('%H:%M:%S')}")
                
        except Exception as e:
            logger.error(f"❌ Error en ping: {e}")
    
    def start_warming(self):
        """Inicia el proceso de warming programado"""
        logger.info("🚀 Iniciando Keep-Warm para Reasoning Engine")
        logger.info("📅 Programación:")
        logger.info("   - Ping cada 5 minutos durante horas activas")
        logger.info("   - Ping cada 15 minutos en horas nocturnas")
        logger.info("   - Horario: 06:00-23:00 (activo), 23:00-06:00 (reducido)")
        
        # Pings frecuentes durante horas activas (6 AM - 11 PM)
        for hour in range(6, 23):
            for minute in [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]:
                schedule.every().day.at(f"{hour:02d}:{minute:02d}").do(self.ping_engine)
        
        # Pings reducidos durante la noche (11 PM - 6 AM)
        night_hours = list(range(23, 24)) + list(range(0, 6))
        for hour in night_hours:
            for minute in [0, 15, 30, 45]:
                schedule.every().day.at(f"{hour:02d}:{minute:02d}").do(self.ping_engine)
        
        # Enviar ping inicial
        logger.info("🏃 Enviando ping inicial...")
        self.ping_engine()
        
        logger.info("⏰ Keep-Warm activo. Presiona Ctrl+C para detener.")
        
        try:
            while True:
                schedule.run_pending()
                time.sleep(30)  # Check every 30 seconds
        except KeyboardInterrupt:
            logger.info("🛑 Keep-Warm detenido por usuario")

def main():
    try:
        warmer = ReasoningEngineWarmer()
        warmer.start_warming()
    except Exception as e:
        logger.error(f"💥 Error fatal: {e}")

if __name__ == "__main__":
    main() 