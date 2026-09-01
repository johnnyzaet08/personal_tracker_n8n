# ADR-004: Versiones de runtime fijadas

- Estado: aceptado
- Fecha: 2026-08-31

## Decisión

Usar Node 24.19.0, Next 16.3.4/React 19.2.8, NestJS 12.0.1, Prisma 7.10.0, PostgreSQL 18.6 y n8n 2.37.4.

## Razón

Node 24 satisface los mínimos actuales de Nest 12, Prisma 7 y Next 16. Prisma 7 permanece estable y soportado; no se eligió Prisma 8 porque al momento de la selección el paquete publicado seguía marcado como release candidate. PostgreSQL 18 está soportado por Prisma y se fijó al patch 18.6. n8n usa el tag estable exacto observado, nunca `latest`.

## Consecuencia

Las actualizaciones se harán por PR separado con lectura de migration guides, build completo, migración sobre copia y prueba de workflows. No se mezclan upgrades mayores con cambios de dominio.
