# Relevo

Herramienta interna para coordinar el trabajo entre Henry (implementación) y Federico (arquitectura) en BOb, BzzzBX, Momentum y los proyectos que vengan. Reemplaza el Google Doc con pestañas por proyecto.

Cada proyecto tiene un board con tres columnas: Por hacer, En proceso y Terminado. Cada tarea muestra de quién es el turno, sus adjuntos con hash, el hilo de respuestas y la actividad de Git vinculada. Las IAs de ambos (Claude y Claude Code) se conectan por MCP para leer y escribir en el board.

## Qué hay en esta carpeta

| Archivo | Para qué |
|---|---|
| `PLAN.md` | Plan de construcción por fases, con modelo de datos, login, tests y criterios de aceptación. Es lo que sigue Claude Code |
| `CLAUDE.md` | Reglas de trabajo para Claude Code en este repo |
| `docs/contexto.md` | Por qué existe Relevo: el problema del flujo actual y las decisiones tomadas |
| `docs/prompt-diseno.md` | El prompt usado para generar el diseño |
| `docs/diseno/` | Fuente del canvas de diseño (board, proyectos, mi turno). Se ve en el canvas "Relevo" de Claude, no abriendo los archivos directamente |

## Stack

Next.js · Supabase (Postgres, Auth, Storage, Realtime) · Vercel · GitHub App · MCP

## Empezar

Abrir esta carpeta con Claude Code y usar el prompt de la sección 15 de `PLAN.md`.

## Conectar las IAs (MCP)

URL del servidor MCP: `https://relevo-bosstechnology.vercel.app/api/mcp` (producción usa por ahora el proyecto de Supabase `relevo-staging`; ver las decisiones de la Fase 6 en `PLAN.md`).

- **Claude (web, desktop, Cowork):** Ajustes → Conectores → Agregar conector personalizado → pegar la URL. Claude se registra solo y abre `/oauth/consent` para que apruebes.
- **Claude Code:** `claude mcp add --transport http relevo https://relevo-bosstechnology.vercel.app/api/mcp` y luego `/mcp` para autenticarse.
- Los clientes autorizados se ven y se revocan en **Conexiones de IA** (`/ajustes/conexiones`).

Línea para el `CLAUDE.md` de cada repo de proyecto:

> Antes de trabajar, lee la tarea en Relevo con `ver_tarea` usando el ID de la rama. Al terminar, responde con el report-back y pasa el turno.

## Desarrollo local

```bash
supabase start
pnpm env:local     # escribe en .env.local la URL y las claves del Supabase local
pnpm dev
```

Seed: `henry@relevo.test` y `federico@relevo.test` (pide el enlace mágico y ábrelo desde Mailpit, http://127.0.0.1:55324).
