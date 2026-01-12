const DATA_URL = './data/code_ubigeo_dep_prov_dis.json';
const INEI_INDEX_URL = './data/ubigeo-inei.json';
const RENIEC_INDEX_URL = './data/ubigeo-reniec.json';
const PLACEHOLDER = '—';
const collator = new Intl.Collator('es', { sensitivity: 'base' });

const clone = (value) => {
	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value));
};

const normalizeName = (value = '') =>
	value
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase()
		.split(' ')
		.map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
		.join(' ');

const normalizeUbigeo = (value = '') => String(value).replace(/\D/g, '').padStart(6, '0');

class UbigeoRepository {
	constructor(sourceUrl) {
		this.sourceUrl = sourceUrl;
		this.readyPromise = null;
		this.departments = [];
		this.departmentsById = new Map();
		this.provincesById = new Map();
		this.districtsByUbigeo = new Map();
		this.districtsByInei = new Map();
	}

	async bootstrap() {
		if (!this.readyPromise) {
			this.readyPromise = this.loadHierarchy();
		}
		return this.readyPromise;
	}

	async loadHierarchy() {
		const response = await fetch(this.sourceUrl);
		if (!response.ok) {
			throw new Error('No se pudo cargar el padrón UBIGEO.');
		}
		const rawHierarchy = await response.json();
		this.departments = this.buildHierarchy(rawHierarchy);
		return this.departments;
	}

	buildHierarchy(rawHierarchy) {
		this.departmentsById.clear();
		this.provincesById.clear();
		this.districtsByUbigeo.clear();
		this.districtsByInei.clear();

		const departments = [];

		for (const [departmentNameRaw, provincesRaw] of Object.entries(rawHierarchy)) {
			const department = {
				id: null,
				name: normalizeName(departmentNameRaw),
				provinces: [],
			};

			for (const [provinceNameRaw, districtsRaw] of Object.entries(provincesRaw)) {
				const districts = Object.entries(districtsRaw)
					.map(([districtNameRaw, metadata]) => {
						const ubigeo = normalizeUbigeo(metadata.ubigeo);
						const ineiCode = metadata.inei ? normalizeUbigeo(metadata.inei) : null;
						const departmentId = ubigeo.slice(0, 2);
						const provinceId = ubigeo.slice(0, 4);
						const district = {
							id: ubigeo,
							name: normalizeName(districtNameRaw),
							departmentId,
							provinceId,
							inei: ineiCode,
							entityId: metadata.id ?? null,
						};
						this.districtsByUbigeo.set(district.id, district);
						if (district.inei) {
							this.districtsByInei.set(district.inei, district);
						}
						return district;
					})
					.sort((a, b) => collator.compare(a.name, b.name));

				if (!districts.length) {
					continue;
				}

				const province = {
					id: districts[0].provinceId,
					name: normalizeName(provinceNameRaw),
					departmentId: districts[0].departmentId,
					districts,
				};

				department.provinces.push(province);
				this.provincesById.set(province.id, province);
			}

			if (!department.provinces.length) {
				continue;
			}

			department.id = department.provinces[0].departmentId;
			department.provinces.sort((a, b) => collator.compare(a.name, b.name));
			departments.push(department);
			this.departmentsById.set(department.id, department);
		}

		departments.sort((a, b) => collator.compare(a.name, b.name));
		return departments;
	}

	getDepartments() {
		return clone(this.departments);
	}

	getDepartmentById(departmentId) {
		const department = this.departmentsById.get(departmentId);
		return department ? clone(department) : null;
	}

	getProvincesByDepartment(departmentId) {
		const department = this.departmentsById.get(departmentId);
		if (!department) {
			return [];
		}
		return clone(department.provinces);
	}

	getProvinceById(provinceId) {
		const province = this.provincesById.get(provinceId);
		return province ? clone(province) : null;
	}

	getDistrictsByProvince(provinceId) {
		const province = this.provincesById.get(provinceId);
		if (!province) {
			return [];
		}
		return clone(province.districts);
	}

	lookupByUbigeo(ubigeo) {
		const normalized = normalizeUbigeo(ubigeo);
		const district = this.districtsByUbigeo.get(normalized);
		if (!district) {
			return null;
		}
		const province = this.provincesById.get(district.provinceId);
		const department = this.departmentsById.get(district.departmentId);
		return clone({ department, province, district });
	}

	lookupByInei(ineiCode) {
		const normalized = normalizeUbigeo(ineiCode);
		const district = this.districtsByInei.get(normalized);
		if (!district) {
			return null;
		}
		const province = this.provincesById.get(district.provinceId);
		const department = this.departmentsById.get(district.departmentId);
		return clone({ department, province, district });
	}

}

class UbigeoCatalogIndex {
	constructor(sourceUrl, { label = 'UBIGEO' } = {}) {
		this.sourceUrl = sourceUrl;
		this.label = label;
		this.readyPromise = null;
		this.records = new Map();
	}

	async bootstrap() {
		if (!this.readyPromise) {
			this.readyPromise = this.loadIndex();
		}
		return this.readyPromise;
	}

	async loadIndex() {
		const response = await fetch(this.sourceUrl);
		if (!response.ok) {
			throw new Error(`No se pudo cargar el catálogo ${this.label}.`);
		}
		const payload = await response.json();
		this.buildIndex(payload);
		return this.records;
	}

	buildIndex(entries = []) {
		this.records.clear();
		entries.forEach((entry) => {
			const departmentId = String(entry.departamento).padStart(2, '0');
			const provincePart = String(entry.provincia).padStart(2, '0');
			const districtPart = String(entry.distrito).padStart(2, '0');
			if (districtPart === '00') {
				return;
			}
			const provinceId = `${departmentId}${provincePart}`;
			const code = normalizeUbigeo(`${departmentId}${provincePart}${districtPart}`);
			this.records.set(code, {
				code,
				departmentId,
				provinceId,
				districtId: code,
				name: entry.nombre ? normalizeName(entry.nombre) : null,
			});
		});
	}

	lookup(code) {
		return this.records.get(normalizeUbigeo(code)) ?? null;
	}
}


class UbigeoCascadeController {
	constructor({ repository, ineiIndex, reniecIndex, elements }) {
		this.repository = repository;
		this.ineiIndex = ineiIndex;
		this.reniecIndex = reniecIndex;
		this.elements = elements;
		this.currentSelection = {
			departmentId: null,
			provinceId: null,
			districtId: null,
		};
	}

	async init() {
		this.setStatus('Descargando padrón nacional y catálogos RENIEC/INEI…');
		try {
			await Promise.all([
				this.repository.bootstrap(),
				this.ineiIndex.bootstrap(),
				this.reniecIndex.bootstrap(),
			]);
			this.populateDepartments();
			this.bindEvents();
			this.setStatus('Listo. Selecciona un departamento para comenzar.');
		} catch (error) {
			console.error(error);
			this.setStatus('Error al cargar los datos. Intenta recargar.', true);
			throw error;
		}
	}

	bindEvents() {
		this.elements.department.addEventListener('change', () => this.handleDepartmentChange());
		this.elements.province.addEventListener('change', () => this.handleProvinceChange());
		this.elements.district.addEventListener('change', () => this.handleDistrictChange());
		this.elements.lookupButton.addEventListener('click', () => this.handleUbigeoLookup());
		this.elements.resetButton.addEventListener('click', () => this.resetForm());
	}

	getSelectedLookupMode() {
		const options = this.elements.ubigeoTypeInputs ?? [];
		const selected = options.find((input) => input.checked);
		return selected ? selected.value : 'reniec';
	}

	populateDepartments() {
		const departments = this.repository.getDepartments();
		this.populateSelect(this.elements.department, departments, 'Selecciona un departamento');
		this.elements.department.disabled = false;
	}

	handleDepartmentChange() {
		const departmentId = this.elements.department.value || null;
		this.currentSelection.departmentId = departmentId;
		this.currentSelection.provinceId = null;
		this.currentSelection.districtId = null;

		if (!departmentId) {
			this.resetProvinceSelect('Selecciona un departamento');
			this.resetDistrictSelect('Selecciona una provincia');
			this.updateSummary();
			return;
		}

		const provinces = this.repository.getProvincesByDepartment(departmentId);
		this.populateSelect(this.elements.province, provinces, 'Selecciona una provincia');
		this.elements.province.disabled = false;
		this.resetDistrictSelect('Selecciona una provincia');
		this.updateSummary();
	}

	handleProvinceChange() {
		const provinceId = this.elements.province.value || null;
		this.currentSelection.provinceId = provinceId;
		this.currentSelection.districtId = null;

		if (!provinceId) {
			this.resetDistrictSelect('Selecciona una provincia');
			this.updateSummary();
			return;
		}

		const districts = this.repository.getDistrictsByProvince(provinceId);
		this.populateSelect(this.elements.district, districts, 'Selecciona un distrito');
		this.elements.district.disabled = false;
		this.updateSummary();
	}

	handleDistrictChange() {
		const districtId = this.elements.district.value || null;
		this.currentSelection.districtId = districtId;
		this.updateSummary();
	}

	handleUbigeoLookup() {
		const rawValue = this.elements.ubigeoInput.value.trim();
		if (!rawValue) {
			this.setStatus('Ingresa un código UBIGEO para buscar.', true);
			return;
		}

		const numericOnly = rawValue.replace(/\D/g, '');
		if (numericOnly.length !== 6) {
			this.setStatus('El código UBIGEO debe tener 6 dígitos.', true);
			return;
		}

		const selectedMode = this.getSelectedLookupMode();
		const modeLabel = selectedMode.toUpperCase();
		const catalog = selectedMode === 'inei' ? this.ineiIndex : this.reniecIndex;
		const catalogRecord = catalog.lookup(numericOnly);
		if (!catalogRecord) {
			this.setStatus(`No encontramos ese código ${modeLabel}.`, true);
			return;
		}

		const match =
			selectedMode === 'inei'
				? this.repository.lookupByInei(catalogRecord.code)
				: this.repository.lookupByUbigeo(catalogRecord.code);
		if (!match) {
			this.setStatus(`El código ${modeLabel} no está sincronizado con el padrón base.`, true);
			return;
		}

		const { department, province, district } = match;
		this.ensureDepartmentSelected(department.id, province.id);
		this.ensureProvinceSelected(province.id, district.id);
		this.ensureDistrictSelected(district.id);
		this.setStatus(`Encontrado (${modeLabel}): ${department.name} / ${province.name} / ${district.name}`);
	}

	ensureDepartmentSelected(departmentId, selectedProvinceId = null) {
		if (!departmentId) {
			return;
		}
		this.elements.department.value = departmentId;
		this.currentSelection.departmentId = departmentId;
		const provinces = this.repository.getProvincesByDepartment(departmentId);
		this.populateSelect(this.elements.province, provinces, 'Selecciona una provincia', selectedProvinceId);
		this.elements.province.disabled = false;
	}

	ensureProvinceSelected(provinceId, selectedDistrictId = null) {
		if (!provinceId) {
			return;
		}
		this.elements.province.value = provinceId;
		this.currentSelection.provinceId = provinceId;
		const districts = this.repository.getDistrictsByProvince(provinceId);
		this.populateSelect(this.elements.district, districts, 'Selecciona un distrito', selectedDistrictId);
		this.elements.district.disabled = false;
	}

	ensureDistrictSelected(districtId) {
		if (!districtId) {
			return;
		}
		this.elements.district.value = districtId;
		this.currentSelection.districtId = districtId;
		this.updateSummary();
	}

	populateSelect(selectElement, items, placeholderLabel, selectedValue = null) {
		selectElement.innerHTML = '';
		const placeholder = document.createElement('option');
		placeholder.value = '';
		placeholder.textContent = placeholderLabel;
		selectElement.appendChild(placeholder);

		items.forEach((item) => {
			const option = document.createElement('option');
			option.value = item.id;
			option.textContent = item.name;
			if (selectedValue && selectedValue === item.id) {
				option.selected = true;
			}
			selectElement.appendChild(option);
		});
	}

	resetProvinceSelect(placeholder) {
		this.populateSelect(this.elements.province, [], placeholder);
		this.elements.province.disabled = true;
	}

	resetDistrictSelect(placeholder) {
		this.populateSelect(this.elements.district, [], placeholder);
		this.elements.district.disabled = true;
	}

	resetForm() {
		this.elements.ubigeoInput.value = '';
		this.elements.department.value = '';
		this.currentSelection = { departmentId: null, provinceId: null, districtId: null };
		this.resetProvinceSelect('Selecciona un departamento');
		this.resetDistrictSelect('Selecciona una provincia');
		this.updateSummary();
		this.setStatus('Formulario reiniciado.');
	}

	setStatus(message, isError = false) {
		this.elements.status.textContent = message;
		this.elements.status.style.color = isError ? '#c0392b' : '#5c5c5c';
	}

	updateSummary() {
		const department = this.currentSelection.departmentId
			? this.repository.getDepartmentById(this.currentSelection.departmentId)
			: null;
		const province = this.currentSelection.provinceId
			? this.repository.getProvinceById(this.currentSelection.provinceId)
			: null;
		const district = this.currentSelection.districtId
			? this.repository.lookupByUbigeo(this.currentSelection.districtId)?.district
			: null;

		const summaryEntries = [
			{ label: 'Departamento', value: department?.name ?? PLACEHOLDER },
			{ label: 'Provincia', value: province?.name ?? PLACEHOLDER },
			{ label: 'Distrito', value: district?.name ?? PLACEHOLDER },
			{ label: 'UBIGEO (RENIEC)', value: district?.id ?? PLACEHOLDER },
			{ label: 'UBIGEO (INEI)', value: district?.inei ?? PLACEHOLDER },
		];

		this.elements.summary.innerHTML = summaryEntries
			.map((entry) => `<p><strong>${entry.label}:</strong> ${entry.value}</p>`)
			.join('');
	}
}

const elements = {
	department: document.getElementById('departmentSelect'),
	province: document.getElementById('provinceSelect'),
	district: document.getElementById('districtSelect'),
	status: document.getElementById('statusMessage'),
	summary: document.getElementById('selectionSummary'),
	ubigeoInput: document.getElementById('ubigeoInput'),
	lookupButton: document.getElementById('ubigeoLookupButton'),
	resetButton: document.getElementById('resetButton'),
	ubigeoTypeInputs: Array.from(document.querySelectorAll('input[name="ubigeoType"]')),
};

const repository = new UbigeoRepository(DATA_URL);
const ineiIndex = new UbigeoCatalogIndex(INEI_INDEX_URL, { label: 'INEI' });
const reniecIndex = new UbigeoCatalogIndex(RENIEC_INDEX_URL, { label: 'RENIEC' });
const controller = new UbigeoCascadeController({ repository, ineiIndex, reniecIndex, elements });
controller.init().catch(() => {
	/* Se maneja el error dentro del controlador */
});
