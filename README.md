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
