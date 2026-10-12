# CONTEXT.md — Glosario del dominio

Términos del proyecto y su significado exacto. Úsalos en código, commits, docs y conversación. Si un término no está aquí, no lo inventes: pregunta y agrégalo.

## Términos

| Término | Significado | Dónde aparece |
|---|---|---|
| Empresa | Agrupa proyectos: Boss, Fuerza de Fuerza, Pinch. Todo proyecto pertenece a una. | `companies`, barra lateral, vista de proyectos |
| Proyecto | Un producto con su prefijo de tareas (BOB, TBT, JR…), sus miembros y sus repos. | `projects` |
| Categoría | Subdivisión opcional de un proyecto; en TBT, cada pestaña del Doc. Una tarea tiene como máximo una. | `categories`, filtro del tablero |
| Tarea | Handoff, pregunta, decisión o pendiente externo, con turno, hilo y adjuntos. Clave `PREFIJO-N`. | `tasks` |
| Turno | Quién tiene que mover la tarea: una persona, un tercero o nadie (terminada). | `tasks.turn` |
| Handoff | Paquete de trabajo que una persona entrega a otra; solo una persona lo cierra, desde la web. | `task_type` |

## Fuera de alcance
Lo que este proyecto explícitamente NO hace.

## Decisiones clave
Enlaces a ADRs en `docs/adr/`.
- [0001 — Empresas encima de los proyectos y categorías dentro](docs/adr/0001-empresas-y-categorias.md)
