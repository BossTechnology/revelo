# ESTADO.md

> Actualizar al cerrar cada sesión. Es lo primero que lee la siguiente.

## Tarea actual
- Ninguna en curso. Fase 7 cerrada; Relevo en uso real (Boss, Fuerza de Fuerza, Pinch).

## Hecho
- 2026-10-12: importación de TBT ejecutada en producción por Henry: Fuerza de Fuerza → TBT con 4 categorías (TBT-1 a TBT-8, 22 respuestas, 24 adjuntos) y Pinch → JobRun (JR), con Henry y Federico como miembros.
- PR #13 mergeado (seed y PLAN con 4 categorías).
- PR #12 mergeado; migración `20261012180000_empresas_categorias.sql` aplicada en producción por Henry (los 5 proyectos quedaron en Boss).
- El Doc de TBT tiene 4 pestañas, no 5 ("Fly.io Account and more" es una sección de TBT.Cafe): seed y PLAN corregidos.
- Script de importación de TBT probado en local (8 tareas, 22 respuestas, adjuntos verificados; idempotente).
- Migración `20261012180000_empresas_categorias.sql`: `companies` (la empresa Boss toma los proyectos actuales), `categories`, `tasks.category_id` con llave foránea compuesta, RLS, `create_project` con empresa e historial de cambios de categoría.
- App: barra lateral y vista de proyectos agrupadas por empresa; empresa en el diálogo de nuevo proyecto; filtro por categoría en el tablero; categoría en la tarjeta, al crear la tarea y en el detalle; gestión de categorías en los ajustes del proyecto.
- MCP: `crear_tarea` acepta `categoria`; `ver_board` filtra por categoría; `ver_tarea` y `resumen_proyecto` la muestran. `import-doc` acepta `categoria`.
- Tests: `empresas.test.sql` (12, vistos fallar al quitar la llave compuesta y el RLS), E2E `categorias.spec.ts` y casos nuevos en `mcp.spec.ts` y `board.spec.ts`.

## Pendiente
- Subir a mano los adjuntos que quedaron como enlace: TBT_Title_Package_02.zip (TBT-4), TBT_Work_Order_Chains_01.docx (TBT-6), TBT_Admin_Tool_Atlas_01.docx (TBT-7), MetaMAP_v0.56.4_developer.zip (MMAP-5) y los dos documentos de BZZ-3.
- Conectar `hdgarzon/tbt.cafe` a TBT: requiere instalar la GitHub App en la cuenta personal de Henry.
- Conectar el repo de JobRun (por definir) y nombrar las ramas con el ID de la tarea para que se vinculen.
- Operación: alertas 5xx en Vercel, rotar la secret key de Supabase, decidir el paso a Supabase Pro.
- Cierre de la Fase 6: archivar los Google Docs de Boss y de TBT.

## Bloqueado
- Nada.

## Siguiente paso
- Atender las tareas en turno de Henry en Relevo (BOB-4, BOB-5, BOB-7, BZZ-3, TBT-4 a TBT-7).

## Notas de sesión
- 2026-10-12: diseño alineado con Henry (Empresa → Proyecto → Categoría, Henry y Federico en todo, importar TBT con historial). Implementado y probado en local.
- 2026-10-12: Fase 7 en producción; importación de TBT preparada y probada en local.
- 2026-10-23: revisión de pendientes; ESTADO al día.
