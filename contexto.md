# Contexto: por qué Relevo

## Cómo se trabaja hoy

Federico organiza con Claude la parte teórica de cada implementación y genera paquetes de handoff (zip + documento .md). Henry los aplica, corre los tests y responde con un report-back. Todo se coordina en un Google Doc con una pestaña por app (BOb, BzzzBX, Momentum), donde quedan preguntas y respuestas, más carpetas de Drive con los archivos.

## Problemas encontrados

1. **El Doc es un log, no un estado.** Para saber qué está abierto hay que leer todo desde arriba.
2. **Las preguntas cruzan proyectos.** N-05 nació en BOb y la respondía el lado de BzzzBX. Los IDs estaban repartidos entre handoffs, Decision Sheet, contract-amendments y el Doc, sin un registro único.
3. **Los artefactos viajan por zip.** Eso rompió la cadena de atestación en Momentum, cuando un re-empaquetado cambió el hash.
4. **Cada ronda mezcla cuatro tipos de contenido** con el mismo formato: instrucciones, preguntas para Henry, preguntas para terceros y decisiones tomadas. Las decisiones firmadas se pierden entre párrafos.
5. **Nadie sabe de quién es el turno.** Los pendientes de terceros (branch protection, TTL, platform team) flotan sin dueño visible.

## Decisiones tomadas

- **App propia** en lugar de GitHub Projects, porque Federico no usa Git.
- **Board por proyecto** con Por hacer, En proceso y Terminado, más un indicador de turno (Henry, Federico o Tercero) en cada tarjeta.
- **Tareas con tipo:** Handoff, Pregunta, Decisión, Pendiente externo. Cada tarea lleva un ID visible (BOB-14), y los IDs viejos (N-05) se conservan como alias.
- **Git conectado por GitHub App + webhook:** commits, PRs y CI se vinculan solos a la tarea por el ID en la rama o en el commit. Debe soportar repos de varias organizaciones.
- **Las IAs conectadas por MCP:** el Claude de Federico y el Claude Code de Henry leen y escriben en el board. Las IAs proponen, las personas firman.
- **Login:** Google + enlace mágico por correo, solo con invitación.
- **Stack:** Next.js + Supabase + Vercel.
- **Uso:** herramienta solo para Henry y Federico, para llevar el flujo, el registro y todo lo que pide el proceso.
