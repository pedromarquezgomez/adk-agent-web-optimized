import json
import os
from typing import Any, Dict, List, Optional


def query_json_database(query_type: str, table: str, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Consulta una base de datos JSON."""
    db_path = os.path.join(os.path.dirname(__file__), "database.json")
    
    try:
        with open(db_path, 'r', encoding='utf-8') as file:
            database = json.load(file)
        
        if table not in database:
            return [{"error": f"Tabla '{table}' no encontrada"}]
        
        data = database[table]
        
        if filters:
            data = [item for item in data if all(item.get(k) == v for k, v in filters.items())]
        
        if query_type == "select":
            return data
        elif query_type == "count":
            return [{"count": len(data)}]
        else:
            return [{"error": "Tipo de consulta no válido"}]
            
    except Exception as e:
        return [{"error": f"Error: {str(e)}"}]


def search_database(table: str, search_term: str, search_field: str = "nombre") -> List[Dict[str, Any]]:
    """Busca registros en la base de datos."""
    db_path = os.path.join(os.path.dirname(__file__), "database.json")
    
    try:
        with open(db_path, 'r', encoding='utf-8') as file:
            database = json.load(file)
        
        if table not in database:
            return [{"error": f"Tabla '{table}' no encontrada"}]
        
        results = [item for item in database[table] 
                  if search_field in item and search_term.lower() in str(item[search_field]).lower()]
        
        return results if results else [{"message": "No se encontraron coincidencias"}]
        
    except Exception as e:
        return [{"error": f"Error: {str(e)}"}]