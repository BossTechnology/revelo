# Relevo — instrucciones para Claude Code

- Lee `PLAN.md` antes de cualquier cambio. Trabaja una fase a la vez y no empieces la siguiente hasta cumplir su "Hecho cuando".
- Respeta los principios de la sección 1 de `PLAN.md`, en especial:
  - Cada dato tiene un solo dueño (Supabase para lo humano, GitHub para el código).
  - Las IAs proponen, las personas firman.
  - El MCP nunca usa la service role.
  - Los guards de seguridad descubren en vez de enumerar, y se ven fallar una vez antes de darlos por buenos.
- Gestor de paquetes: pnpm.
- Ramas: `fase-N-descripcion` mientras se construye el MVP.
- Base de datos: todo cambio va en una migración en `supabase/migrations/`. Nunca editar tablas desde el dashboard.
- Antes de abrir un PR: `pnpm lint`, `pnpm typecheck`, `pnpm test` y `supabase test db` en verde.
- Si algo del plan es ambiguo o contradice lo que encuentras en el código, detente y pregunta en vez de suponer.

<!-- agent-kit:start -->
## Seguridad
- Nunca leer, imprimir ni pegar `.env*`, llaves, tokens, dumps de BD ni datos reales de clientes. Usa `.env.example` como referencia de variables.
- Comandos destructivos (`rm -rf`, `git push --force`, migraciones, SQL en producción, deploys a prod) requieren confirmación explícita de Henry.
- Supabase/Vercel: solo branches y previews desde el agente. Producción la ejecuta Henry.

## Git
- Sin atribución de IA en commits, PRs ni issues (nada de `Co-Authored-By` ni "Generated with").
- Commits en el idioma del historial del repo. Staging por rutas explícitas; nunca `git add -A`.
- Una sesión = una tarea = una rama/PR. `/clear` entre tareas.

## Documentación
- `CONTEXT.md`: glosario del dominio. Usa esos términos en código, commits y respuestas. Si aparece un término nuevo, agrégalo.
- `ESTADO.md`: estado de la tarea actual. **Al terminar cada sesión (o con `/handoff`), actualiza Hecho / Pendiente / Bloqueado / Siguiente paso.**
- `docs/adr/`: una ADR por decisión de arquitectura o producto que costó tomar. Plantilla en `docs/adr/0000-plantilla.md`.
- `CHANGELOG.md`: una línea por cambio entregado, bajo "Sin publicar".

## Cómo trabajar
- Lee `ESTADO.md` y `CONTEXT.md` antes de empezar.
- Cambios no triviales: alinear primero (`/grill-with-docs` o preguntas), luego spec, luego implementar con tests.
- Antes de proponer una librería nueva, revisa si ya hay algo equivalente en el repo.
<!-- agent-kit:end -->
