# Auditoría técnica — Farmacia Alpha 1

Fecha: 2026-09-25. Rama: `farmacia-v0`. Se auditó el working tree, incluyendo los cambios previos sin commit. No se hicieron commits ni se descartaron cambios existentes.

## Hallazgos y correcciones

### Críticos

- La migración podía eliminar importaciones históricas duplicadas automáticamente. Ahora migra dentro de una transacción y aborta sin borrar históricos si encuentra duplicados o no puede recuperar el archivo necesario para calcular su hash. Resolver una base histórica conflictiva requiere una decisión explícita sobre sus datos.
- La normalización numérica podía transformar formatos ambiguos o inválidos en importes válidos pero incorrectos. Ahora se rechazan agrupaciones inválidas, espacios internos y separadores ambiguos. Se aceptan `1234`, `1234.50`, `1234,50` y `1.234,50`; se rechazan `1.234` y `1,234` por ambigüedad. Se rechazan negativos, valores vacíos y precisión superior a dos decimales.

### Importantes

- El clasificador analítico podía responder una métrica distinta ante filtros, períodos o preguntas compuestas no soportadas. Se acotaron las intenciones aceptadas y se devuelve una respuesta conservadora para consultas operativas no soportadas. La respuesta numérica autorizada es determinística; una salida diferente del modelo no la reemplaza.
- Agrupar también por nombre podía dividir un mismo SKU renombrado. Ranking y baja rotación agrupan ahora por SKU y muestran su nombre más reciente. El dashboard se calcula sobre una única instantánea de lectura.
- La ruta relativa de SQLite dependía del directorio de arranque. La configuración y la base se resuelven ahora respecto del servidor, preservando la ubicación habitual de V0.1.
- Se reforzaron las escrituras con `BEGIN IMMEDIATE`, hash obligatorio e índice único. Un fallo intermedio revierte importación y registros. Se verificó una carrera de seis importaciones del mismo contenido: una aceptación y cinco rechazos.
- El preview escribía temporalmente en disco. Ahora usa memoria y no crea archivos ni registros.
- Se rechazan encabezados duplicados/ambiguos, delimitadores mezclados relevantes, filas incompletas y contenido dañado. Se conservan BOM, alias, comillas, coma/punto y coma y fechas válidas de ambos formatos.
- Warm-up podía declarar listo un modelo sin confirmar su carga. Ahora valida la respuesta, verifica residencia y comparte la carga en curso. Se controlan timeouts y errores; una falla no derriba la API. Ollama se limita a loopback y se rechazan redirecciones.
- Se validan mensajes/sesiones de chat, se rechazan solicitudes simultáneas para una misma sesión y no se incorpora el contexto analítico al historial del chat general. Los mensajes fallidos no quedan guardados como conversaciones exitosas.
- Se filtran errores HTTP para no devolver detalles internos. Las escrituras con un Origin de otro sitio se rechazan; el frontend servido por BEKANTOR conserva acceso del mismo origen, incluida la IP LAN.
- El iniciador necesitaba control real de procesos y cierre. Ahora controla instancia por puerto, verifica ocupación, encuentra la instalación habitual de Ollama y limpia únicamente los procesos que él inició.

### Menores

- Un preview tardío podía reemplazar el resultado de otro archivo seleccionado. Se descartan respuestas obsoletas.
- Un error del dashboard podía dejar cifras anteriores visibles. Ahora se limpian.
- Se acotó la cantidad de sesiones en memoria y se corrigió el umbral vacío de stock para usar el valor por defecto.
- El test de chat se aisló de la base real mediante un directorio temporal.

## Fuente de verdad y definiciones verificadas

Dashboard y herramientas analíticas usan el mismo servicio y repositorio SQLite. No se ejecuta SQL generado por el modelo.

- Período: desde `MAX(sale_date) - 29 días` hasta `MAX(sale_date)`, ambos inclusive: 30 fechas calendario, sin depender del día actual.
- Ventas: `ROUND(COALESCE(SUM(sales_amount), 0), 2)` dentro del período.
- Unidades: `ROUND(COALESCE(SUM(units_sold), 0), 2)` dentro del período.
- Top: suma de unidades por SKU en el período, orden descendente y desempate por nombre/SKU, límite 5.
- Stock bajo: último registro de cada SKU, ordenado por fecha y luego ID; `current_stock <= LOW_STOCK_THRESHOLD`, por defecto 10. No se suma stock entre filas. Es el último stock conocido, no una medición en tiempo real.
- Baja rotación: SKU presente en el período con suma de unidades menor o igual a 5. No incluye automáticamente productos ausentes de ese período.
- Dataset vacío: período nulo, totales cero y listas vacías. Parámetros variables enlazados en las consultas.

## Verificación ejecutada

`cd server; npm test`: **27 tests, 27 aprobados, 0 fallidos, 0 omitidos** en la ejecución final. Incluye los tests anteriores y regresiones de rollback, migración, números ambiguos, SKU renombrado, concurrencia HTTP, aislamiento del preview, chat general/analítico, reinicio, persistencia y estados de Ollama. Los errores de Ollama impresos por algunos tests son fallas simuladas deliberadas, no tests fallidos.

Flujo HTTP real con SQLite temporal, sin importar sobre la base del usuario:

1. Preview del CSV de ejemplo: 5 filas y sin escritura.
2. Importación: HTTP 201, 1 importación y 5 registros.
3. Dashboard: ventas 169100 y unidades 59.
4. Chat analítico: importe coincidente con el dashboard.
5. Segundo intento del mismo contenido: HTTP 409 y mensaje de duplicado.
6. Reinicio del proceso: se mantienen 1 importación y 5 registros.
7. `/health`, `/api/farmacia/imports`, `/api/farmacia/dashboard` y `/api/status` operativos. Status sin rutas, secretos ni stack traces.

El flujo se ejecutó también usando `http://192.168.0.7:3122` y Origin del mismo servidor. Esta prueba ejercita la interfaz LAN desde el propio equipo; no valida firewall ni conectividad desde otro dispositivo.

### Ejecución real de start-bekantor.ps1

- Ejecutado desde la ruta del repositorio con espacios.
- Ollama ya iniciado: reutilizado sin detenerlo; modelo real `qwen3:0.6b` listo y respuesta de chat general comprobada.
- Ollama detenido: probado en un puerto loopback aislado, 11435, para no detener el Ollama existente del usuario. El script inició el ejecutable instalado.
- Modelo inexistente: API disponible y estado controlado de modelo ausente.
- Segunda ejecución: rechazada por control de instancia; un puerto ocupado por otro listener también fue rechazado.
- Ctrl+C: verificado en consola fuera del sandbox; cerró Node y, cuando correspondía, el Ollama iniciado por ese script. La instancia previa del usuario en 127.0.0.1:11434 permaneció activa.
- El sandbox inicialmente impidió iniciar Ollama y no entregó Ctrl+C de forma fiable. Se repitieron esas pruebas con ejecución autorizada fuera del sandbox; no se confunden esas restricciones con un resultado exitoso del primer intento.
- No quedaron servidores BEKANTOR de auditoría ni el listener aislado de Ollama activos. No se verificó de forma independiente el cierre forzado de la ventana ni un apagado del equipo.

También se verificó sintaxis PowerShell y `git diff --check` sin errores de whitespace; Git advierte la conversión habitual LF/CRLF.

## Archivos tocados durante esta auditoría

Algunos ya contenían cambios previos: esta lista no implica que toda su diferencia contra HEAD corresponda a la auditoría.

- `README.md`, `AUDITORIA_ALPHA1.md`
- `client/app.js`
- `scripts/start-bekantor.ps1`
- `server/src/config/env.js` (nuevo)
- `server/src/app.js`
- `server/src/controllers/chat.controller.js`
- `server/src/controllers/pharmacy.controller.js`
- `server/src/data/database.js`
- `server/src/data/pharmacy.repository.js`
- `server/src/routes/pharmacy.routes.js`
- `server/src/services/conversation.service.js`
- `server/src/services/csv-import.service.js`
- `server/src/services/inference.service.js`
- `server/src/services/ollama-status.service.js`
- `server/src/services/pharmacy-analytics.service.js`
- `server/src/services/pharmacy-chat.service.js`
- `server/test/audit-integrity.test.js` (nuevo)
- `server/test/http-regression.test.js` (nuevo)
- `server/test/ollama-status.test.js`
- `server/test/pharmacy-chat.test.js`

## Límites y riesgos pendientes

- Sin autenticación ni TLS: cualquier cliente con acceso a la API puede utilizarla e importar archivos. La comprobación de Origin no es autenticación. Piloto únicamente en una LAN confiable y con control de firewall.
- SHA-256 evita repetir los mismos bytes, incluso cambiando el nombre. No identifica ventas repetidas en exportaciones distintas, reordenadas o solapadas. Resolver esto requiere identificadores de transacción del origen y una política de actualización: no se rediseñó automáticamente.
- SKU es la identidad local del producto; no hay separación por sucursal. No mezclar exportaciones incompatibles.
- Importes almacenados como REAL se redondean a dos decimales para mostrar agregados. Esto no sustituye un diseño contable de enteros en centavos para gran escala.
- La auditoría no certifica la corrección de importaciones históricas ya persistidas ni reinterpreta automáticamente sus números.
- Un cierre abrupto puede dejar un CSV huérfano en uploads aunque SQLite revierta los registros. No se implementó limpieza automática de archivos históricos.
- El chat analítico es deliberadamente conservador: no admite filtros, comparaciones ni períodos arbitrarios. El chat general sigue siendo generativo, pero no es la fuente autorizada de métricas.
- Las llamadas de inferencia de BEKANTOR se restringen a Ollama local; no se verificó todo el tráfico de otros procesos instalados en Windows. No se descargaron modelos durante la auditoría.
- Sin prueba visual completa en navegador ni prueba desde otro dispositivo. Tampoco se simuló corte eléctrico, disco lleno o carga sostenida de múltiples usuarios. Una instalación que no permita ejecutar Ollama debe resolver sus permisos.

## Prueba manual Alpha 1

Para un ensayo limpio sin tocar la base habitual, abrir PowerShell en la raíz del repositorio y ejecutar:

```powershell
$env:PORT = '3001'
$env:FARMACIA_DATA_DIR = Join-Path $env:TEMP ('bekantor-alpha-manual-' + [guid]::NewGuid().ToString('N'))
.\scripts\start-bekantor.ps1
```

1. Abrir `http://localhost:3001`. Usar `server/examples/farmacia-ejemplo.csv`: revisar preview e importar. Verificar 5 filas, ventas 169.100 y 59 unidades; comprobar período y tablas.
2. Preguntar `¿Cuánto vendimos?` y comparar con el dashboard. Probar una consulta no soportada como `ventas de ayer`: debe aclarar la limitación, no inventar un importe. Probar un saludo en el chat general con el modelo listo.
3. Importar exactamente el mismo archivo, también renombrado: debe mostrar `Este archivo ya fue importado anteriormente.` y conservar 1 importación/5 registros.
4. Probar CSV inválido y cambiar rápidamente de archivo durante el preview: no debe importar datos ni mostrar el preview anterior como si fuera el nuevo.
5. Pulsar Ctrl+C y volver a ejecutar el script en la misma consola, sin regenerar `FARMACIA_DATA_DIR`: comprobar persistencia.
6. Consultar `/health`, `/api/status` y `/api/farmacia/imports`. Probar desde otro dispositivo usando la IP LAN real y puerto 3001. No abrir Ollama a la LAN.
7. Finalizar con Ctrl+C. En esa consola, quitar los overrides con `Remove-Item Env:PORT, Env:FARMACIA_DATA_DIR`; esto no borra la base temporal.

No se avanzó a otra versión ni se hicieron commits.
