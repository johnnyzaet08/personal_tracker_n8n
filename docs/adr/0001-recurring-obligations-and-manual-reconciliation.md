# ADR 0001: Obligaciones recurrentes y conciliación manual

Estado: aceptada (2026-09-07)

Los patrones de pagos recurrentes no son gastos. Cada mes se materializa explícitamente una obligación única por tenant, patrón y período; un `GET` nunca la crea. El vencimiento conserva el día nominal del patrón y para los días inexistentes del mes se usa el último día.

Al confirmar un pago manual se crea un `source_event` de procedencia `manual` (no un correo inventado) y una transacción canónica, enlazadas a la obligación. La conciliación de un movimiento entrante exige débito, moneda e importe exactos, cuenta compatible cuando se conoce, alias normalizado y una ventana de siete días. Una coincidencia única enlaza la obligación; las ambigüedades se envían a revisión. La confirmación manual y la conciliación bancaria permanecen como estados distintos.

Los presupuestos, porcentajes y disponible siguen fuera de esta entrega. Las obligaciones pendientes se exponen como compromisos previstos por moneda, sin presentarse como débitos confirmados.
