# BEKANTOR Private AI

## Farmacia V0.1

La importación de farmacia funciona enteramente dentro del nodo local. Los CSV cargados se guardan en `server/data/uploads/` y sus registros en `server/data/farmacia.sqlite`; ambos directorios están excluidos de Git. Cada archivo se identifica por un hash SHA-256 de su contenido, por lo que un archivo exacto no se puede importar dos veces.

Formato esperado (también se aceptan sinónimos como `codigo`, `nombre_producto`, `cantidad`, `importe` y `stock`):

```csv
sku,producto,categoria,fecha,unidades_vendidas,importe_venta,stock_actual
PARA-500,Paracetamol 500 mg,Analgesicos,2026-09-01,18,45000,24
```

Para iniciar el nodo:

```powershell
cd server
npm start
```

Abrí `http://localhost:3000`, seleccioná un CSV en **Datos de farmacia** e importalo. Consultá el estado de las importaciones mediante `GET /api/farmacia/imports`.

## Dashboard operativo (Farmacia V0.2)

`GET /api/farmacia/dashboard` calcula los indicadores sólo con SQLite. El período de ventas abarca los 30 días inclusivos hasta la fecha máxima cargada. El stock bajo toma la última lectura de cada SKU y usa `LOW_STOCK_THRESHOLD` (10 por defecto). La baja rotación incluye productos con hasta 5 unidades vendidas acumuladas dentro de ese período.

## Farmacia Alpha 1 (V0.3–V0.5)

El chat reconoce preguntas sobre ventas, unidades, productos más vendidos, stock bajo y baja rotación. Consulta el mismo servicio analítico del dashboard y responde con cifras verificadas; si el modelo local no responde, conserva la respuesta determinística. Todas las preguntas analíticas sin período explícito usan los últimos 30 días inclusivos de los datos; no se consulta la fecha del sistema. El chat general sigue usando Ollama local.

La importación admite encabezados equivalentes, coma o punto y coma, BOM UTF-8, fechas `YYYY-MM-DD` o `DD/MM/YYYY`, y números como `1.234,50` en CSV separado por punto y coma. Al seleccionar un archivo, la pantalla muestra una vista previa validada de hasta cinco filas antes de importarlo. `POST /api/farmacia/preview` no guarda registros ni conserva el archivo temporal. El hash SHA-256 sigue identificando archivos exactos.

`GET /api/status` informa API, SQLite, Ollama, modelo configurado y si hay datos. Al iniciar, BEKANTOR comprueba Ollama y solicita el precalentamiento del modelo sin bloquear el servidor. Para iniciar en Windows también se puede ejecutar `scripts/start-bekantor.ps1`, que intenta iniciar `ollama serve` si está instalado y aún no responde.

`OLLAMA_URL` debe apuntar a `localhost`, `127.0.0.1` o `::1` mediante HTTP. No se siguen redirecciones. El script lee la misma configuración del servidor, evita instancias duplicadas por puerto y arranca Ollama exclusivamente en loopback. Ctrl+C detiene Node y el Ollama que haya creado el propio script; respeta un Ollama que ya estaba iniciado.

Limitaciones para un piloto: el stock se toma de la última fila observada por SKU; no hay catálogo separado de productos sin ventas. Dos archivos distintos con filas de venta repetidas no se deduplican entre sí. El formato CSV todavía requiere las seis columnas obligatorias indicadas arriba y no sustituye una integración directa con el ERP. La aplicación se sirve por LAN sin autenticación; restringí la red y usá sólo datos aprobados para el piloto.

La API se usa desde la misma dirección y puerto que la interfaz web. No habilita CORS para otras páginas; para un piloto, no expongas el puerto de BEKANTOR a Internet.

### Correcciones de auditoría Alpha 1

El parser rechaza números ambiguos (`1.234`, `1,234`), espacios internos (`1 2`), agrupaciones inválidas y más de dos decimales. Usá `1234`, `1234.50`, `1234,50` o `1.234,50`. Fechas inexistentes, encabezados repetidos y filas vacías delimitadas producen un error. Preview valida en memoria, sin escribir archivos ni registros.

El SKU identifica al producto en todos los indicadores. Nombres y categorías distintos no dividen sus ventas; se muestra el último nombre registrado. Ventas y unidades se suman y redondean a dos decimales. Stock bajo: último stock por SKU (fecha descendente, luego id descendente), menor o igual al umbral. Baja rotación: hasta cinco unidades acumuladas en el período, sólo para SKU con filas en él. Top: cinco SKU por unidades, con desempate por nombre y SKU. El período sigue siendo fecha máxima menos veintinueve días, inclusivo.

El chat sólo resuelve formulaciones explícitas de las capacidades disponibles. Rechaza otros períodos, filtros, métricas y preguntas múltiples; nunca interpreta «sin stock» como «stock bajo». No incorpora respuestas analíticas a la memoria libre del LLM. No puede responder seguimientos analíticos implícitos.

Las migraciones son atómicas y no eliminan registros históricos. Ante hashes históricos duplicados o CSV faltantes para reconstruirlos, el arranque se detiene con explicación y conserva la base. Revisar una copia es necesario para resolver esos casos; no se corrigen automáticamente. Importaciones nuevas usan una transacción y el índice SHA-256 único, incluso con cargas simultáneas.
