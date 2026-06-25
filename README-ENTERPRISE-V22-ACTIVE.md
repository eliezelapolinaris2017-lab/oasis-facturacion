# Oasis Business Cloud Enterprise V2.2 Active Ops

Esta versión activa las funciones que antes estaban visibles pero incompletas.

## Funciones activas

- Dashboard con KPIs reales de documentos, clientes, equipos, servicios, inventario y alertas.
- CRM y clientes operativos.
- Equipos HVAC operativos: guardar, listar, borrar y exportar CSV.
- Servicios operativos: crear orden, editar, seleccionar, borrar, exportar CSV y convertir servicio seleccionado en factura.
- Inventario operativo: crear ítem, editar, borrar, alertas de mínimo, valor total y exportar CSV.
- Reportes Enterprise conectados a documentos, clientes, equipos, servicios e inventario.
- Backup/restore ampliado: documentos, clientes, equipos, servicios, inventario y configuración.
- Desktop y mobile sincronizados con la misma funcionalidad.

## Colecciones Firestore usadas

- users/{uid}/docs
- users/{uid}/customers
- users/{uid}/equipment
- users/{uid}/services
- users/{uid}/inventory
- users/{uid}/settings/main

## Nota técnica

Si Firebase Rules bloquea alguna colección nueva, habilitar permisos para:

- services
- inventory

bajo el mismo patrón de seguridad usado para docs, customers y equipment.
