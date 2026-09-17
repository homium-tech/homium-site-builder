# /homium-site-builder

Inicia o gestiona el servidor homium-site-builder desde Claude Code.

## Uso

```
/homium-site-builder [start|stop|status|open|logs|--update]
```

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `start` | Inicia el servidor en http://localhost:3000 |
| `stop` | Detiene el servidor |
| `status` | Muestra si el servidor está corriendo |
| `open` | Abre en el navegador (inicia si está detenido) |
| `logs` | Sigue los logs en tiempo real |
| `--update` | Actualiza a la última versión desde GitHub |

## Ejemplos

```bash
# Iniciar
homium-site-builder start

# Verificar estado
homium-site-builder status

# Actualizar
homium-site-builder --update
```

## Variables de entorno

- `PORT` — Puerto HTTP (default: 3000)
- `WORKSPACE_DIR` — Directorio de proyectos (default: ~/Downloads/homium_projects)
