# ADR-007: Períodos y paginación de previsualizaciones Gmail

- Estado: aceptado.
- Fecha: 2026-11-01.
- Alcance: sincronización manual de una fuente Gmail desde Revisión.

## Contexto

La previsualización limitaba la búsqueda al mes actual y a diez mensajes. Esto
impedía revisar correos más antiguos dentro de períodos recientes y ocultaba
mensajes adicionales aunque pertenecieran al mismo mes.

## Decisión

- La búsqueda por mes permite únicamente el mes actual y los dos meses
  anteriores, en la zona `America/Costa_Rica`.
- La búsqueda por fechas acepta un inicio y un fin inclusivos dentro de esa misma
  ventana; hoy es el último día permitido.
- Gmail se consulta mediante `nextPageToken` hasta completar los resultados. La
  API recibe lotes de hasta diez mensajes; solo el lote final cierra la
  previsualización. El identificador de Gmail y el upsert tenant-scoped hacen
  los reintentos idempotentes.
- La UI presenta diez filas por página. Selecciones hechas en páginas distintas
  se conservan y se envían como una lista completa de IDs elegibles.
- Se elimina el panel agregado «Resultado de la ejecución». El detalle por fila,
  los errores sanitizados y el historial plegable se conservan.
- `exactDate` se mantiene en el contrato y en las ejecuciones existentes como
  compatibilidad de rango de un solo día; las nuevas búsquedas guardan el inicio
  en la columna existente y el fin en `range_end_date`.

## Consecuencias

- La migración es aditiva y no modifica ni elimina ejecuciones existentes.
- Las previsualizaciones pueden contener más de diez filas y tardar más al
  consultar Gmail. El límite duro de ejecución de tres minutos de ADR-006 sigue
  vigente.
- La tabla por páginas evita cargar visualmente todos los mensajes a la vez; el
  dominio conserva los candidatos necesarios para seleccionar resultados de
  cualquier página.
