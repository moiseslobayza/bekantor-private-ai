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
