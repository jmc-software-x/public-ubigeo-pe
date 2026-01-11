# Public Ubigeo Perú

Frontend estático listo para GitHub Pages que expone el padrón UBIGEO oficial en un selector en cascada (departamento → provincia → distrito) y ofrece búsqueda directa por código UBIGEO.

## Arquitectura

- `data/code_ubigeo_dep_prov_dis.json`: fuente única de verdad. Se distribuye como archivo estático para no depender de bases de datos.
- `js/script.js`: normaliza los datos siguiendo las reglas del backend original, indexa jerarquías y alimenta el UI.
- `index.html`: interfaz con estilo responsive, pensada para embeber en formularios corporativos.

El runtime es 100% cliente, lo que permite alojarlo en GitHub Pages, Cloudflare Pages u otro hosting CDN sin costo.

## Generar endpoints estáticos

El archivo fuente se parte en bundles listos para ser consumidos como si fueran endpoints REST.

```bash
npm run build:data
```

La tarea anterior deja estos recursos dentro de `data/`:

- `hierarchy.json`: listado total de departamentos.
- `departments/{departmentId}.json`: provincias por departamento.
- `provinces/{provinceId}.json`: distritos por provincia.
- `districts/{ubigeo}.json`: detalle directo por código UBIGEO.

Esto permite URLs como:

- `https://<user>.github.io/<repo>/data/hierarchy.json`
- `https://<user>.github.io/<repo>/data/departments/15.json`
- `https://<user>.github.io/<repo>/data/provinces/1501.json`
- `https://<user>.github.io/<repo>/data/districts/150101.json`

## Uso local

1. `npm run build:data` (solo si cambiaste el padrón base).
2. `npm run serve` para abrir un server en `http://localhost:4173`.
3. Navega a `http://localhost:4173/index.html` y prueba el flujo en cascada.
4. Usa el cuadro de búsqueda para validar los endpoints `districts/{ubigeo}.json`.

## Integración con otros frontends

Si necesitas reutilizar el dataset desde otra aplicación, puedes consumir el mismo archivo estático:

```js
const response = await fetch('https://<tu-gh-username>.github.io/public-ubigeo-pe.json/data/districts/150101.json');
const districtBundle = await response.json();
```

El mismo patrón aplica a los otros archivos (`hierarchy`, `departments`, `provinces`) para poblar tus selects sin tocar bases de datos.
