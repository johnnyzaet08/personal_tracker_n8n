# Validación de migraciones en una base vacía

`compose.yaml` conserva nombres estables para que el entorno local normal
pueda reutilizar sus datos. No se debe ejecutar una segunda copia con esos
recursos globales: Docker puede intentar adjuntar los volúmenes o redes de la
instalación existente y producir un conflicto de nombres.

Para comprobar migraciones desde cero sin tocar ese entorno, ejecute desde la
raíz del repositorio:

```powershell
.\infrastructure\scripts\validate-empty-database.ps1
```

El script crea un identificador aleatorio, aplica
`compose.empty-db.yaml`, arranca solamente `postgres` y el servicio `migrate`,
y espera el resultado de `prisma migrate deploy` y del seed. El overlay asigna
redes y volúmenes propios a ese identificador. Al terminar, el script elimina
solo esos recursos temporales mediante el mismo nombre de proyecto y el
identificador generado. No actúa sobre `tracker_postgres_data`, `tracker_data`,
`tracker_public` ni contenedores del entorno normal.

Para inspeccionar una ejecución que no pudo limpiarse, reutilice el `RunId`
que se pasó al script y ejecute:

```powershell
docker compose -p <run-id> -f compose.yaml -f infrastructure/docker/compose.empty-db.yaml down --volumes --remove-orphans
```
