# RUNBOOK de Relevo

Tareas de operación que se repiten. Cada una dice qué correr y cómo comprobar que salió bien.

| Entorno | App | Supabase |
|---|---|---|
| Local | `pnpm dev` | `supabase start` (puertos 553xx, Mailpit en http://127.0.0.1:55324) |
| Staging | Previews de Vercel y, hasta la Fase 6, `relevo-bosstechnology.vercel.app` | `relevo-staging` (`gtyjlrdqafpbvnjnzjqp`, org BOSS) |
| Producción | Dominio propio (Fase 6) | `relevo-prod` (plan Pro, Fase 6) |

Las credenciales de staging viven en `.env.staging.local` (no se versiona). Nunca se pegan en un chat ni en un issue.

---

## Invitar a alguien

Solo entra quien está en `allowed_emails` y tiene cuenta (PLAN.md §4).

```bash
# Con correo de invitación (necesita SMTP en el entorno):
NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SECRET_KEY=<secret> \
  node scripts/invite.mts persona@boss.technology --nombre "Nombre" --rol arquitectura --sitio https://<app>

# Sin correo (entra con Google o pidiendo el enlace mágico):
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

- **Diarios:** los del plan Pro de Supabase (producción).
- **Semanales:** el workflow `backup` (`.github/workflows/backup.yml`) corre los lunes, hace `pg_dump` (esquema y datos) y lo guarda como artifact de GitHub por 90 días. Necesita el secreto de Actions `SUPABASE_PROD_DB_URL`.

Restaurar en staging (prueba obligatoria de la Fase 6, una vez):

```bash
gh run download <run-id> -n relevo-backup -D /tmp/relevo-backup
psql "$SUPABASE_STAGING_DB_URL" -v ON_ERROR_STOP=1 -f /tmp/relevo-backup/schema.sql
psql "$SUPABASE_STAGING_DB_URL" -v ON_ERROR_STOP=1 -f /tmp/relevo-backup/data.sql
```

Comprobar: `select count(*) from tasks;` coincide con producción y la app de staging muestra los proyectos.

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
