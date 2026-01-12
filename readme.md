# Public Ubigeo Perú

Frontend estático listo para GitHub Pages que expone el padrón UBIGEO oficial en un selector en cascada (departamento → provincia → distrito) y ofrece búsqueda directa por código UBIGEO.

## Arquitectura

- `data/code_ubigeo_dep_prov_dis.json`: fuente única de verdad. Se distribuye como archivo estático para no depender de bases de datos.
- `js/script.js`: normaliza los datos siguiendo las reglas del backend original, indexa jerarquías y alimenta el UI.
- `index.html`: interfaz con estilo responsive, pensada para embeber en formularios corporativos.

El runtime es 100% cliente, lo que permite alojarlo en GitHub Pages, Cloudflare Pages u otro hosting CDN sin costo.

- **Sitio publicado:** https://jmc-software-x.github.io/public-ubigeo-pe/

## Despliegue automático (GitHub Pages)

La carpeta `.github/workflows/deploy.yml` prepara un flujo 100% automatizado:

1. Cada push a `main` (o un disparo manual `workflow_dispatch`) ejecuta `npm run build:data` en GitHub Actions.
2. El resultado completo del repositorio se empaqueta como artefacto y se publica en GitHub Pages mediante `actions/deploy-pages`.
3. Solo tienes que activar Pages en `Settings → Pages → Source → GitHub Actions`. El workflow se encargará del resto.

Cuando el build termina, la URL pública queda registrada en el ambiente `github-pages` dentro del propio workflow.

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

### Ejemplo práctico (React/Vite)

Cuando se consume desde un frontend moderno, evita fijar `Content-Type` manualmente en peticiones `GET` para no disparar un preflight CORS innecesario. Basta con aceptar JSON:

```tsx
const loadHierarchy = async () => {
	try {
		const res = await fetch(
			'https://jmc-software-x.github.io/public-ubigeo-pe/data/hierarchy.json',
			{
				headers: {
					Accept: 'application/json',
				},
			}
		);

		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const data = await res.json();
		setTest(data);
		console.log('Datos:', data);
	} catch (err) {
		console.error('Error fetch:', err);
		setTest(null);
	}
};

useEffect(() => {
	loadHierarchy();
}, []);
```

Y en el JSX puedes renderizar la respuesta directamente:

```jsx
<pre>{JSON.stringify(test, null, 2)}</pre>
```

Reemplaza la URL por el endpoint específico que necesites (por ejemplo, `departments/15.json`). Mientras mantengas `Accept: application/json` y no fuerces otros headers, los servidores de GitHub (raw, jsDelivr o Pages con proxy) responderán sin errores de CORS.

## Sobre JMC-CORPORATION

- **Razón social:** JMC-CORPORATION · RUC 20614882027
- **Sitio web:** https://www.jmc-corporation.com/
- **LinkedIn:** https://www.linkedin.com/in/jmc-business
- **WhatsApp:** https://wa.me/51900284446

> Deseamos unificar las fuentes de información y APIs comúnmente utilizados. Nuestro principal ideal es ayudar a los nuevos ingenieros a incorporar más rápido sus aplicaciones. Escanea los QR disponibles en la sección de soporte (Yape/Plin) para aportar o solicitar ayuda prioritaria.
