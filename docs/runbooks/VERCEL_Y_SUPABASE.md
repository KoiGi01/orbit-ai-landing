# Vercel y Supabase

Este repositorio está enlazado a:

- Vercel: `lead-scoop/autivex-ai-landing`
- Supabase: `llyxspttialehvjspolv` (`AutiveX AI DB`)

Los enlaces locales viven en `.vercel/` y `supabase/.temp/`. Ambos directorios están ignorados por Git. La autenticación de los CLI se guarda en el almacenamiento local de credenciales y nunca debe copiarse al repositorio.

## Cambios de base de datos

1. Crear una migración:

   ```powershell
   npx.cmd --yes supabase@latest migration new nombre_del_cambio
   ```

2. Editar el SQL creado en `supabase/migrations/`.
3. Ejecutar `npm.cmd test`.
4. Revisar lo que se aplicará:

   ```powershell
   npx.cmd --yes supabase@latest db push --linked --dry-run
   ```

5. Aplicar la migración solo después de revisar el dry run:

   ```powershell
   npx.cmd --yes supabase@latest db push --linked
   ```

No hacer cambios estructurales directamente desde el SQL Editor de producción. Si ocurre, capturar y reconciliar el cambio antes de continuar con otras migraciones.

## Vercel

Listar variables y despliegues:

```powershell
npx.cmd --yes vercel@latest env ls
npx.cmd --yes vercel@latest list
```

Crear un Preview sin modificar producción:

```powershell
npx.cmd --yes vercel@latest deploy --yes
```

La integración nativa de Supabase proporciona `POSTGRES_URL` en Production. Preview usa las variables server-side del pooler configuradas en Vercel. Nunca crear variables `VITE_` que contengan contraseñas, connection strings o service-role keys.

Verificación segura desde un deployment protegido:

```powershell
npx.cmd --yes vercel@latest curl https://DEPLOYMENT_URL/api/health/database
```

La respuesta correcta es:

```json
{"ok":true,"database":"connected","schema":"ready"}
```

Promover a Production es una acción separada y deliberada; no usar `--prod` durante verificaciones de desarrollo.
