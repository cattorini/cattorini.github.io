/**
 * Datos de prueba reutilizables.
 *
 * IMPORTANTE: el código master de acá es SOLO de test. Los tests sirven
 * fixtures/productos.fixture.json (no el productos.json real), cuyo
 * config.mayoristas.codigo_hash es el hash de este código. Nunca poner acá
 * un código real: la carpeta tests/ se publica en GitHub Pages.
 */

export const CODIGO_MASTER = 'TEST-MASTER-0001';
/** SHA-256 hex de "TEST-MASTER-0001" (= config.mayoristas.codigo_hash del fixture) */
export const CODIGO_MASTER_HASH = 'bcb1625dafeeb125eff030c86dff6e5786a9466740ce91418f2738cdc3a35294';

/** Usuario de staff de PRUEBA (Firebase Auth email/contraseña, solo existe en
 *  el mock — setupPage lo registra por default en firebase.authUsers). Es el
 *  mismo email que usa la allowlist de tests/rules/reference. */
export const STAFF_EMAIL = 'staff@cattorini.test';
export const STAFF_PASS = 'staff-test-pass-123';

/** Código individual de mayorista para tests */
export const CODIGO_MAYO_INDIVIDUAL = 'CATT-TEST01';
/** SHA-256 hex de "CATT-TEST01" */
export const CODIGO_MAYO_INDIVIDUAL_HASH = '58a5cebc72d33ba18f32cc265a084d74542bff3c6c339566183d93bfad453034';

export const mayoristaSample = {
  nombre: 'Juan Pérez',
  negocio: 'Textil Norte SRL',
  cuit: '20-12345678-9',
  tipo: 'Tienda de ropa',
  telefono: '02932-441234',
  whatsapp: '5492932441234',
  email: 'juan@textilnorte.com.ar',
  provincia: 'Buenos Aires',
  localidad: 'Bahía Blanca',
  direccion: 'San Martín 1234',
  codigoPostal: '8000',
  notas: 'Cliente antiguo, compra mensualmente'
};

export const solicitudPendienteSample = {
  codigo: 'MAY-ABCD',
  creadoEn: { toDate: () => new Date('2026-07-25T12:00:00Z'), seconds: 1785380400 },
  solicitante: {
    nombre: 'María Gómez',
    negocio: 'Boutique Central',
    cuit: '27-98765432-1',
    tipo: 'Tienda de ropa',
    telefono: '11-4555-6666',
    whatsapp: '5491145556666',
    email: 'maria@boutique.com',
    provincia: 'Buenos Aires',
    localidad: 'La Plata',
    direccion: 'Calle 50 nº 700',
    codigoPostal: '1900'
  },
  notas: 'Interesada en línea de camisas',
  estado: 'pendiente',
  respuesta: null
};

export const solicitudAceptadaSample = {
  codigo: 'MAY-WXYZ',
  creadoEn: { toDate: () => new Date('2026-07-20T10:00:00Z'), seconds: 1784952000 },
  solicitante: {
    nombre: 'Carlos Rodríguez',
    negocio: 'Ropa CR',
    telefono: '351-555-1234',
    whatsapp: '5493515551234',
    email: 'carlos@ropacr.com',
    provincia: 'Córdoba',
    localidad: 'Córdoba',
    direccion: 'Av. Colón 500',
    codigoPostal: '5000',
    cuit: '',
    tipo: 'Tienda de ropa'
  },
  notas: '',
  estado: 'aceptada',
  respuesta: {
    codigoMayorista: 'CATT-XYZ789',
    resueltoEn: { toDate: () => new Date('2026-07-21T09:00:00Z'), seconds: 1785034800 }
  }
};

export const solicitudRechazadaSample = {
  codigo: 'MAY-QQQQ',
  creadoEn: { toDate: () => new Date('2026-07-15T08:00:00Z'), seconds: 1784505600 },
  solicitante: {
    nombre: 'Test Rechazado',
    negocio: 'X',
    whatsapp: '5491100000000',
    provincia: 'Buenos Aires',
    localidad: 'Ramos Mejía'
  },
  notas: '',
  estado: 'rechazada',
  respuesta: {
    motivo: 'No trabajamos con esa zona por el momento.',
    resueltoEn: { toDate: () => new Date('2026-07-16T10:00:00Z'), seconds: 1784592000 }
  }
};

export const pedidoPendienteSample = {
  codigo: 'A3F7B',
  creadoEn: { toDate: () => new Date('2026-07-27T14:00:00Z'), seconds: 1785549600 },
  cliente: {
    nombre: 'Ana López',
    negocio: '',
    whatsapp: '',
    email: '',
    cuit: '',
    direccion: 'Av. Corrientes 500',
    provincia: 'Ciudad Autónoma de Buenos Aires',
    localidad: 'Ciudad Autónoma de Buenos Aires',
    codigoPostal: '1043',
    perfil: 'minorista',
    zonaStatus: 'libre',
    localidadPerfil: 'Ciudad Autónoma de Buenos Aires, Ciudad Autónoma de Buenos Aires'
  },
  items: [
    { id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', qty: 2, precio: 22000 }
  ],
  modalidad: 'envio',
  subtotal: 44000,
  envio: 4500,
  total: 48500,
  nota: '',
  estado: 'pendiente'
};

export function pedidoConEstado(estado: string, extra: Record<string, any> = {}) {
  return {
    ...pedidoPendienteSample,
    codigo: 'X' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    estado,
    ...extra
  };
}
