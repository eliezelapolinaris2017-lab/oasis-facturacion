# Oasis Business Cloud Enterprise V2.1

Actualización aplicada sobre el proyecto existente `oasis-facturacion-main`.

## Cambios principales

- Rebranding de Nexus Invoicing a Oasis Business Cloud Enterprise.
- Nuevo menú ERP: Dashboard, CRM, Equipos, Servicios, Documento, Clientes, Historial, Inventario, Reportes y Configuración.
- Dashboard Enterprise con KPI de ventas del mes, ventas del día, por cobrar, clientes, documentos, equipos, garantías, servicios y alertas.
- CRM Premium con expediente de cliente, conteo de documentos, equipos y valor histórico.
- Módulo Equipos con registro HVAC: cliente, propiedad, tipo, marca, modelo, capacidad, refrigerante, voltaje, fecha de instalación, garantía y Health Score.
- Reportes Enterprise base.
- Backup/restore ahora incluye `equipment`.
- Firestore preparado con colección `users/{uid}/equipment`.
- Versión desktop y mobile sincronizadas.

## Archivos modificados

- index.html
- index-mobile.html
- styles.css
- styles-mobile.css
- app.js
- app-mobile.js

## Nota técnica

Esta versión mantiene compatibilidad con los documentos y clientes existentes. El nuevo módulo de equipos usa una colección separada para evitar romper la base actual.
