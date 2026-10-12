# ESTADO.md

> Actualizar al cerrar cada sesión. Es lo primero que lee la siguiente.

## Tarea actual
- Fase 7: empresas y categorías (`PLAN.md` §Fase 7, `docs/adr/0001-empresas-y-categorias.md`). Rama `fase-7-empresas-categorias`.

## Hecho
- Migración `20261012180000_empresas_categorias.sql`: `companies` (la empresa Boss toma los proyectos actuales), `categories`, `tasks.category_id` con llave foránea compuesta, RLS, `create_project` con empresa e historial de cambios de categoría.
- App: barra lateral y vista de proyectos agrupadas por empresa; empresa en el diálogo de nuevo proyecto; filtro por categoría en el tablero; categoría en la tarjeta, al crear la tarea y en el detalle; gestión de categorías en los ajustes del proyecto.
- MCP: `crear_tarea` acepta `categoria`; `ver_board` filtra por categoría; `ver_tarea` y `resumen_proyecto` la muestran. `import-doc` acepta `categoria`.
- Tests: `empresas.test.sql` (12, vistos fallar al quitar la llave compuesta y el RLS), E2E `categorias.spec.ts` y casos nuevos en `mcp.spec.ts` y `board.spec.ts`.

## Pendiente
- Henry: aplicar la migración en producción (`supabase db push`) **antes** de mergear el PR; si se mergea primero, el deploy consulta tablas que aún no existen.
- Henry, desde la web: crear TBT (empresa Fuerza de Fuerza) con sus 5 categorías y JobRun (empresa Pinch).
- Importar el historial del Doc "TBT Dev Flow" con respuestas y adjuntos, cada sección en la categoría de su pestaña (sesión aparte).
- Conectar `hdgarzon/tbt.cafe` a TBT: requiere instalar la GitHub App en la cuenta personal de Henry.

## Bloqueado
- Nada.

## Siguiente paso
- Revisar y aplicar la migración en producción, mergear el PR y crear TBT y JobRun.

## Notas de sesión
- 2026-10-12: diseño alineado con Henry (Empresa → Proyecto → Categoría, Henry y Federico en todo, importar TBT con historial). Implementado y probado en local.
