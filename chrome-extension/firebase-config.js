// Configuración pública del proyecto Firebase (no es un secreto: el acceso lo
// controlan las reglas de Firestore, no esta clave).
export const FIREBASE_CONFIG = {
  apiKey: '***REMOVED_API_KEY***',
  projectId: 'meet-light-juntas'
};

// Página de reportes (Firebase Hosting). También es el único origen al que la
// extensión le acepta la vinculación de cuenta (ver externally_connectable).
export const REPORT_ORIGIN = 'https://meet-light-juntas.web.app';
