from google.adk.agents import Agent

from adk_short_bot.prompt import ROOT_AGENT_INSTRUCTION
from adk_short_bot.tools import count_characters, query_json_database, search_database

root_agent = Agent(
    name="adk_short_bot",
    model="gemini-2.0-flash",
    description="Un bot que acorta mensajes manteniendo su significado principal y puede consultar información de base de datos",
    instruction=ROOT_AGENT_INSTRUCTION,
    tools=[count_characters, query_json_database, search_database],
)
