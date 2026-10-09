# RUNBOOK de Relevo

Tareas de operación que se repiten. Cada una dice qué correr y cómo comprobar que salió bien.

| Entorno | App | Supabase |
|---|---|---|
| Local | `pnpm dev` | `supabase start` (puertos 553xx, Mailpit en http://127.0.0.1:55324) |
| Producción | `relevo-bosstechnology.vercel.app` y los previews de Vercel | `relevo-staging` (`gtyjlrdqafpbvnjnzjqp`, org BOSS, plan free) |
| Producción futura | — | `relevo-prod` en plan Pro, cuando se decida (backups diarios y sin pausa por inactividad) |

Las credenciales de staging viven en `.env.staging.local` (no se versiona). Nunca se pegan en un chat ni en un issue.

---

## Invitar a alguien

Solo entra quien está en `allowed_emails` y tiene cuenta (PLAN.md §4).

```bash
# Con correo de invitación (necesita SMTP; hoy no hay, así que en producción se usa --sin-correo):
NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SECRET_KEY=<secret> \
  node scripts/invite.mts persona@boss.technology --nombre "Nombre" --rol arquitectura --sitio https://<app>

# Sin correo (entra con Google; el enlace mágico está apagado en producción con RELEVO_MAGIC_LINK=off):
… node scripts/invite.mts persona@boss.technology --nombre "Nombre" --rol desarrollo --sin-correo
```

Comprobar: la persona aparece en Ajustes del proyecto → Miembros → Agregar. Después hay que sumarla a cada proyecto desde ahí.

## Revocar un cliente de IA (MCP)

1. La persona entra a **Conexiones de IA** (`/ajustes/conexiones`) y pulsa **Revocar** en el cliente.
2. Supabase borra sus refresh tokens. El access token vigente vence en máximo 1 hora; si hace falta cortarlo ya, en el dashboard de Supabase: Authentication → OAuth Apps → eliminar el cliente.

Comprobar: el cliente desaparece de la lista y la IA recibe 401 en la siguiente llamada después de vencer el token.

## Aplicar migraciones

Las tablas nunca se editan desde el dashboard. Todo va por `supabase/migrations/`.

```bash
set -a; . ./.env.staging.local; set +a
export SUPABASE_DB_PASSWORD="$SUPABASE_STAGING_DB_PASSWORD"
supabase link --project-ref <ref>
supabase db push --dry-run   # revisar la lista
supabase db push
supabase migration list      # local y remoto deben coincidir
```

Configuración de Auth: `supabase config diff --project-ref <ref>` y, si el diff es el esperado, `SUPABASE_YES=1 supabase config push --project-ref <ref>`. Lo que no es de Relevo se fija en `[remotes.<entorno>]` para que el push no lo cambie.

## Backups y restauración

- **Diarios:** ninguno por ahora. El plan free no los tiene; llegan con `relevo-prod` en plan Pro.
- **Semanales:** el workflow `backup` (`.github/workflows/backup.yml`) corre los lunes, hace `pg_dump` (esquema y datos) y lo guarda como artifact de GitHub por 90 días. Necesita el secreto de Actions `SUPABASE_PROD_DB_URL`.

Restaurar (probado el 5 de octubre de 2026 con el backup de la corrida 37259365305: 12 tablas,
22 políticas, todos los datos, 0 tablas sin RLS). Se restaura sobre una base de Supabase **limpia**
(un proyecto nuevo, o `supabase db start` en una carpeta aparte con otros puertos):

```bash
gh run download <run-id> --repo BossTechnology/revelo -n relevo-backup -D /tmp/relevo-backup
psql "$DESTINO_DB_URL" -v ON_ERROR_STOP=1 -f /tmp/relevo-backup/schema.sql
psql "$DESTINO_DB_URL" -v ON_ERROR_STOP=1 -f /tmp/relevo-backup/data.sql
```

- `roles.sql` no hace falta en Supabase (los roles vienen en la imagen) y falla al fijar
  parámetros reservados como `log_min_messages`; es solo para restaurar en un Postgres propio.
- Fuera de Supabase el esquema no restaura: depende de `auth`, `storage`, `vault` y `extensions`.

Comprobar: `select count(*) from tasks;` coincide con el origen, y la consulta del guard de RLS
(`supabase/tests/datos.test.sql`, primer test) devuelve 0 tablas sin RLS.

## Rotar secretos

| Secreto | Dónde se rota | Dónde se actualiza |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Supabase → Settings → API keys → nueva secret key, luego revocar la vieja | Vercel (Production y Preview) y `.env.staging.local` |
| `GITHUB_WEBHOOK_SECRET` | `openssl rand -hex 32` | GitHub App → Webhook secret y Vercel |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App → Private keys → Generate, luego borrar la vieja | Vercel (con `\n` escapados) |
| `CRON_SECRET` | `openssl rand -hex 32` | Vercel (Production) |
| Google OAuth secret | Google Cloud → Credentials → cliente → Reset secret | `.env.staging.local` y `supabase config push` |
| SMTP | Proveedor (Resend) → nueva API key | Supabase Auth → SMTP (`config push`) |

Después de rotar en Vercel hay que redesplegar (`vercel redeploy <url> --scope bosstechnology` o un push a `main`).

## Monitoreo

- Logs: Vercel → proyecto `relevo` → Logs, filtrando por `/api/mcp` y `/api/github/webhook`.
- Alertas: Vercel → Observability → Alerts → regla "5xx > 3 en 5 minutos" para esas dos rutas, con aviso por correo a Henry.
- El webhook deja en los logs cada respuesta 4xx/5xx con el prefijo `[github-webhook]`.

## Conectar un repo de GitHub a un proyecto

1. Ajustes del proyecto → **Instalar la GitHub App en una organización** → elegir la organización y los repos.
2. GitHub vuelve a la misma página con el número de instalación ya puesto.
3. Escribir `organización/repo` y **Conectar**.

Comprobar: un push a una rama `bob-N-…` aparece en la tarjeta `BOB-N` en segundos. Si no, revisar en GitHub App → Advanced → Recent deliveries el código de respuesta.
