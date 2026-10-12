# ESTADO.md

> Actualizar al cerrar cada sesión. Es lo primero que lee la siguiente.

## Tarea actual
- Fase 7, cierre: crear TBT (Fuerza de Fuerza) y JobRun (Pinch) en producción e importar el historial del Doc "TBT Dev Flow" por categoría.

## Hecho
- PR #12 mergeado; migración `20261012180000_empresas_categorias.sql` aplicada en producción por Henry (los 5 proyectos quedaron en Boss).
- El Doc de TBT tiene 4 pestañas, no 5 ("Fly.io Account and more" es una sección de TBT.Cafe): seed y PLAN corregidos.
- Script de importación de TBT probado en local (8 tareas, 22 respuestas, adjuntos verificados; idempotente).
- Migración `20261012180000_empresas_categorias.sql`: `companies` (la empresa Boss toma los proyectos actuales), `categories`, `tasks.category_id` con llave foránea compuesta, RLS, `create_project` con empresa e historial de cambios de categoría.
- App: barra lateral y vista de proyectos agrupadas por empresa; empresa en el diálogo de nuevo proyecto; filtro por categoría en el tablero; categoría en la tarjeta, al crear la tarea y en el detalle; gestión de categorías en los ajustes del proyecto.
- MCP: `crear_tarea` acepta `categoria`; `ver_board` filtra por categoría; `ver_tarea` y `resumen_proyecto` la muestran. `import-doc` acepta `categoria`.
- Tests: `empresas.test.sql` (12, vistos fallar al quitar la llave compuesta y el RLS), E2E `categorias.spec.ts` y casos nuevos en `mcp.spec.ts` y `board.spec.ts`.

## Pendiente
- Henry: correr el script de importación de TBT en producción (crea Fuerza de Fuerza/TBT con 4 categorías y Pinch/JobRun).
- Subir a mano los adjuntos que no se pudieron copiar (TBT_Title_Package_02.zip de 16.9 MB y los que quedaron como enlace).
- Conectar `hdgarzon/tbt.cafe` a TBT: requiere instalar la GitHub App en la cuenta personal de Henry.

## Bloqueado
- Nada.

## Siguiente paso
- Ejecutar la importación de TBT en producción y revisar el tablero de TBT.

## Notas de sesión
- 2026-10-12: diseño alineado con Henry (Empresa → Proyecto → Categoría, Henry y Federico en todo, importar TBT con historial). Implementado y probado en local.
- 2026-10-12: Fase 7 en producción; importación de TBT preparada y probada en local.
