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
