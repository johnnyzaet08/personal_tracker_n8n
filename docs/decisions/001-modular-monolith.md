# ADR-001: Monolito modular en monorepo

- Estado: aceptado
- Fecha: 2026-08-31

## Decisión

Usar pnpm workspaces, NestJS y Next.js con paquetes compartidos. Los dominios se separan en módulos y schemas, pero la API se despliega como un proceso.

## Consecuencia

Se preservan transacciones simples, menor carga operativa y tipos compartidos. Un módulo solo se separará cuando exista una necesidad medida de escala, seguridad o ciclo de despliegue independiente.
