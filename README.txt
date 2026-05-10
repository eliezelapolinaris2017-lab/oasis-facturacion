Nexus Invoicing — versión moderna simplificada

Archivos principales:
- index.html
- styles.css
- app.js
- CNAME si aplica

La versión móvil usa el mismo motor para evitar duplicar errores:
- index-mobile.html
- styles-mobile.css
- app-mobile.js

Clientes compartidos:
- users/{uid}/customers
- users/{uid}/shared_customers/items

Importación CRM:
- Lee clientes desde users/{uid}/oasis_crm_v3/clients/items
- Los copia a la base compartida para usarlos en facturas/cotizaciones.

Sube todos los archivos a GitHub Pages y fuerza recarga en iPad/iPhone.
