# 0002 — Miembros lectores por proyecto

- **Fecha:** 2026-10-28
- **Estado:** aceptada

## Contexto
Henry quiere sumar a personas de afuera (un cliente, alguien de la empresa del proyecto) para que vean el avance de un solo proyecto sin poder cambiar nada. Hoy todos los miembros de un proyecto tienen los mismos permisos: `is_member()` gobierna la lectura y también la escritura de tareas, respuestas, adjuntos, Storage, categorías, repos y miembros. Además:
- cualquier sesión lee todos los `profiles`;
- `companies` se renombra con `is_company_member()` (miembro de cualquier proyecto de la empresa);
- `create_project` (security definer) deja crear proyectos a cualquier sesión en una empresa nueva, y a cualquier miembro en una existente;
- cualquier miembro suma personas a su proyecto, y nadie puede quitarlas (no hay política de delete en `project_members`).

## Opciones consideradas
1. **Acceso por proyecto** en `project_members` (`editor` | `lector`). Una persona puede ser editora en BOB y lectora en TBT.
2. **Permiso global** en `profiles`: una persona es lectora en todos sus proyectos.
3. **Lector que comenta:** como 1, pero puede responder en los hilos.

Para cambiar el acceso:
- a) políticas de update y delete en `project_members`, con un trigger que valida las reglas (patrón de `guard_task_update`);
- b) una función `security definer`.

## Decisión
La opción 1 con la variante a), elegidas por Henry el 28 de octubre de 2026. El lector se diseña pensando en alguien de afuera en quien no se confía del todo.

**Qué puede el lector**
- Ve todo su proyecto: tablero, tareas, hilos, historial, vínculos de GitHub y adjuntos (los descarga).
- No escribe nada: no crea ni edita tareas, no responde, no marca, no adjunta, no cambia estado ni turno, no toca categorías, repos, miembros ni el proyecto.
- Usa las herramientas de lectura del MCP. Las de escritura le responden un error claro ("Tu acceso a TBT es de solo lectura"). El RLS ya lo bloquea porque el MCP usa su token.
- Puede salirse del proyecto.

**Reglas de acceso**
- Columna `project_members.acceso` (`editor` | `lector`), por defecto `lector`: quien se equivoca da menos permisos, no más. La migración deja a los miembros actuales como `editor`.
- `puede_editar(project_id)` reemplaza a `is_member()` en toda política de insert, update y delete. La lectura sigue con `is_member()`.
- Solo un editor suma miembros, cambia el acceso de cualquiera o quita a alguien. No hay rol de dueño aparte.
- Un proyecto nunca se queda sin editor: no se puede quitar ni bajar al último.
- Solo un editor puede tener el turno. La base rechaza pasárselo a un lector, y rechaza bajar a lector o quitar a alguien que tiene tareas abiertas en su turno (el mensaje las lista).
- Al crear un proyecto, quien lo crea queda como editor y cada persona sumada elige Editor o Lector (por defecto Lector). Nadie viene marcado de antemano (antes venían todas las personas): con gente de afuera invitada, marcarlas por defecto las sumaría por accidente a cada proyecto nuevo.

**Fuera del proyecto**
- `profiles`: ves el tuyo y los de quienes comparten algún proyecto contigo. Si eres editor de al menos un proyecto, ves todos (hace falta para encontrar a un recién invitado en "Agregar miembro").
- `companies`: el lector ve el nombre de la empresa de su proyecto; solo un editor de algún proyecto de esa empresa la renombra.
- `create_project`: en una empresa existente, exige ser editor de alguno de sus proyectos; en una nueva, ser editor de al menos un proyecto.

**Guards (se ven fallar una vez antes de darlos por buenos)**
- Uno recorre `pg_policies` en `public` y `storage` y exige que toda política de insert, update o delete use `puede_editar()`, salvo una lista explícita (`profiles`: cada quien edita su perfil).
- Otro recorre las funciones `security definer` ejecutables por `authenticated` y falla si aparece una fuera de la lista revisada.
- Tests de comportamiento: un lector intenta cada escritura y falla.

Se eligió a) sobre b) porque así las reglas viven en el RLS, que aplica igual a la web y al MCP, y no se suma otra función que se salta el RLS.

## Consecuencias
- Henry puede invitar a una persona de afuera a un solo proyecto sin que vea los demás, los perfiles ajenos ni pueda mover nada.
- Sumar a alguien al crear un proyecto cuesta dos clics más: marcarlo y, si va a escribir, elegir Editor.
- Fuera de alcance por ahora: lector que comenta, invitar desde la web (sigue siendo `scripts/invite.mts`, lo corre Henry), un rol de dueño o administrador, y avisos por correo al sumar a alguien o cambiar su acceso.
- Vigilar: toda tabla o función nueva que escriba tiene que pasar por `puede_editar()`; los guards lo hacen fallar en CI si se olvida.
