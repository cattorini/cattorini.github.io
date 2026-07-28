/**
 * Datos de prueba reutilizables.
 * Hash del código master "CATT2024" precalculado.
 */

export const CODIGO_MASTER = 'CATT2024';
export const CODIGO_MASTER_HASH = '280cfbb74b55fca4baa3631bb025bd0c2b7edf87f000827e026569cbad7ccbfe';

/** Código individual de mayorista para tests */
export const CODIGO_MAYO_INDIVIDUAL = 'CATT-TEST01';
/** SHA-256 hex de "CATT-TEST01" — precalculado */
export const CODIGO_MAYO_INDIVIDUAL_HASH = '2b78d3a8b5b8ff02c3eb8f2cd82ff02c34fd12a7a89dc0bb1cd0bfec9e0abd5f';

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
