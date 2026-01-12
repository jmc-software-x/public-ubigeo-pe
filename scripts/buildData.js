const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../data/code_ubigeo_dep_prov_dis.json');
const rawHierarchy = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

const collator = new Intl.Collator('es', { sensitivity: 'base' });

const normalizeName = (value = '') =>
    value
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .split(' ')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join(' ');

const normalizeUbigeo = (value = '') => String(value).replace(/\D/g, '').padStart(6, '0');

const buildHierarchy = () => {
    const departments = [];
    const departmentsById = new Map();
    const provincesById = new Map();

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
                    if (ubigeo === '000000') {
                        return null;
                    }
                    const departmentId = ubigeo.slice(0, 2);
                    const provinceId = ubigeo.slice(0, 4);
                    const ineiCode = metadata.inei ? normalizeUbigeo(metadata.inei) : null;
                    return {
                        id: ubigeo,
                        name: normalizeName(districtNameRaw),
                        departmentId,
                        provinceId,
                        inei: ineiCode && ineiCode !== '000000' ? ineiCode : null,
                        entityId: metadata.id ?? null,
                    };
                })
                .filter(Boolean)
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
            provincesById.set(province.id, province);
        }

        if (!department.provinces.length) {
            continue;
        }

        department.id = department.provinces[0].departmentId;
        department.provinces.sort((a, b) => collator.compare(a.name, b.name));
        departments.push(department);
        departmentsById.set(department.id, department);
    }

    departments.sort((a, b) => collator.compare(a.name, b.name));
    return { departments, departmentsById, provincesById };
};

const { departments: hierarchy, departmentsById, provincesById } = buildHierarchy();

const OUTPUT_ROOT = path.resolve(__dirname, '../data');

const ensureDir = (dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
};

const writeJson = (relativePath, payload) => {
    const targetPath = path.join(OUTPUT_ROOT, relativePath);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
};

const summarizeProvince = (province) => ({
    id: province.id,
    name: province.name,
    departmentId: province.departmentId,
});

const summarizeDistrict = (district) => ({
    id: district.id,
    name: district.name,
    provinceId: district.provinceId,
    departmentId: district.departmentId,
    inei: district.inei ?? null,
    entityId: district.entityId ?? null,
});

const buildDistrictPayload = (department, province, district) => ({
    department: { id: department.id, name: department.name },
    province: { id: province.id, name: province.name },
    district: summarizeDistrict(district),
});

const writeLookupBundles = (bundle, district) => {
    writeJson(`lookup/reniec/${district.id}.json`, {
        lookupType: 'reniec',
        lookupCode: district.id,
        ...bundle,
    });

    if (district.inei) {
        writeJson(`lookup/inei/${district.inei}.json`, {
            lookupType: 'inei',
            lookupCode: district.inei,
            ...bundle,
        });
    }
};

const buildStaticEndpoints = () => {
    writeJson('hierarchy.json', hierarchy.map(({ id, name }) => ({ id, name })));

    for (const department of hierarchy) {
        writeDepartmentBundle(department.id);
        for (const province of department.provinces) {
            writeProvinceBundle(province.id);
            for (const district of province.districts) {
                writeDistrictBundle(district.id);
            }
        }
    }
};

const writeDepartmentBundle = (departmentId) => {
    const department = departmentsById.get(departmentId);
    if (!department) {
        throw new Error(`Departamento ${departmentId} no encontrado`);
    }

    writeJson(`departments/${department.id}.json`, {
        department: { id: department.id, name: department.name },
        provinces: department.provinces.map(summarizeProvince),
    });
};

const writeProvinceBundle = (provinceId) => {
    const province = provincesById.get(provinceId);
    if (!province) {
        throw new Error(`Provincia ${provinceId} no encontrada`);
    }

    const department = departmentsById.get(province.departmentId);
    if (!department) {
        throw new Error(
            `Departamento ${province.departmentId} faltante para la provincia ${provinceId}`,
        );
    }

    writeJson(`provinces/${province.id}.json`, {
        department: { id: department.id, name: department.name },
        province: { id: province.id, name: province.name },
        districts: province.districts.map(summarizeDistrict),
    });
};

const writeDistrictBundle = (ubigeo) => {
    const provinceId = ubigeo.slice(0, 4);
    const province = provincesById.get(provinceId);
    if (!province) {
        throw new Error(`Provincia ${provinceId} no encontrada para el distrito ${ubigeo}`);
    }

    const department = departmentsById.get(province.departmentId);
    if (!department) {
        throw new Error(
            `Departamento ${province.departmentId} faltante para el distrito ${ubigeo}`,
        );
    }

    const district = province.districts.find((item) => item.id === ubigeo);
    if (!district) {
        throw new Error(`Distrito ${ubigeo} no encontrado en la provincia ${provinceId}`);
    }

    const bundle = buildDistrictPayload(department, province, district);
    writeJson(`districts/${district.id}.json`, bundle);
    writeLookupBundles(bundle, district);
};

buildStaticEndpoints();

console.log('Bundles generados en la carpeta data/.');
