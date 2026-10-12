# 0001 — Empresas encima de los proyectos y categorías dentro

- **Fecha:** 2026-10-12
- **Estado:** aceptada

## Contexto
Relevo nació para los proyectos de Boss. Henry y Federico también coordinan Fuerza de Fuerza (el proyecto TBT, con un Doc de cinco pestañas: TBT.Cafe, Fly.io, 3 Chains, TBT Admin y TBT Content) y Pinch (el proyecto JobRun). Hace falta separar las empresas y, dentro de TBT, separar sus frentes sin perder una sola numeración de tareas.

## Opciones consideradas
1. **Empresa → Proyecto → Categoría.** TBT es un proyecto (TBT-1, TBT-2…) y cada pestaña una categoría dentro de él.
2. **Empresa → Proyecto.** Cada pestaña del Doc de TBT pasa a ser un proyecto propio, como se hizo con el Doc de Boss.
3. Etiquetas libres en las tareas, sin empresa.

## Decisión
La opción 1, elegida por Henry el 12 de octubre de 2026. Las pestañas de TBT comparten repo, personas y numeración: son frentes de un mismo proyecto, no proyectos distintos. La empresa es obligatoria para todo proyecto; la categoría es opcional y pertenece a un solo proyecto.
- La empresa se crea dentro de `create_project` (security definer). Así no hay empresas vacías ni una política de inserción abierta. Si la empresa ya existe, quien crea el proyecto tiene que ser miembro de alguno de sus proyectos.
- Una tarea solo puede tener una categoría de su propio proyecto: llave foránea compuesta `(project_id, category_id)` hacia `categories (project_id, id)`.
- Las categorías no se borran, se archivan: el historial de las tareas las sigue nombrando.

## Consecuencias
- Un proyecto sin categorías (todos los de Boss hoy) se ve igual que antes.
- No hay pantalla para mover un proyecto de empresa; si hace falta, se agrega después.
- Los permisos siguen siendo por proyecto: ver una empresa no da acceso a sus otros proyectos.
