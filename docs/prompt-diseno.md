# Prompt usado para el diseño

```
Diseña una aplicación web interna para coordinar el trabajo entre dos personas: Henry (desarrollador, implementa en código) y Federico (arquitecto, diseña la parte teórica y envía paquetes de instrucciones). Federico NO usa Git; Henry sí. La app es el punto de encuentro entre los dos y reemplaza un Google Doc desordenado con pestañas por proyecto.

Estilo: herramienta de desarrollo, limpia y densa en información, tipo Linear. Modo claro y oscuro. Interfaz en español.

Pantallas que necesito:

1. INICIO – LISTA DE PROYECTOS
Tarjetas por proyecto: BOb, BzzzBX, Momentum. Cada tarjeta muestra: nombre, repos conectados de GitHub (pueden ser de organizaciones distintas), cuántas tareas hay en cada estado, cuántas están esperando a Henry y cuántas a Federico, y la última actividad (ej. "PR #21 mergeado hace 2 h").
Botón para crear un proyecto nuevo y conectar repos.

2. BOARD DEL PROYECTO (kanban)
Tres columnas: Por hacer · En proceso · Terminado.
Cada tarjeta muestra:
- ID de la tarea (ej. BOB-12, N-05)
- Tipo con color: Handoff, Pregunta, Decisión, Pendiente externo
- Título
- Indicador de TURNO muy visible: "Turno: Henry", "Turno: Federico" o "Turno: Tercero" (ej. platform team). Es lo más importante de la tarjeta.
- Íconos de adjuntos y respuestas con contador
- Estado de Git si tiene código vinculado: rama, PR abierto/mergeado, CI verde/rojo
Filtro rápido arriba: "Lo que me toca a mí".

3. DETALLE DE TAREA (panel lateral o modal)
- Encabezado: ID, tipo, título, estado, turno (editable), fecha límite opcional
- Descripción / instrucciones
- Adjuntos con tamaño y hash md5/sha1 calculado al subir, con botón de copiar hash
- Hilo de respuestas entre Henry y Federico. Una respuesta se puede marcar como "Respuesta oficial" o "Decisión firmada".
- Sección "Actividad en Git" (solo lectura): commits, PRs y CI vinculados por el ID de la tarea.
- Historial de cambios de estado y de turno.

4. VISTA "MI TURNO"
Lista de todas las tareas de todos los proyectos donde el turno es del usuario actual, ordenadas por fecha límite y antigüedad.
```
