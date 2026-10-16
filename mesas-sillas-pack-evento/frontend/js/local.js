// Datos del local. ⚠️ UBICACIÓN FICTICIA de ejemplo (Apopa, San Salvador, El Salvador): reemplaza estos valores por los reales.
// Coordenadas: centro aproximado de Apopa. Para otro punto, copia lat/lng desde Google Maps (clic derecho sobre el lugar).
const LOCAL = {
  ficticio: true,
  nombre: 'SIMEP · Sucursal Apopa',
  direccion: ['Avenida Principal #25, Colonia Las Delicias', 'Apopa, San Salvador', 'El Salvador'],
  referencia: 'A pocas cuadras del centro de Apopa, sobre la avenida principal. Portón negro con rótulo azul.',
  lat: 13.8072, lng: -89.1795,
  telefono: '+503 7000-0000', correo: 'contacto@mesasysillas.example',
  zona: 'America/El_Salvador',
  // Horario: 0 = domingo … 6 = sábado; [abre, cierra] en horas decimales (8 = 8:00, 13.5 = 1:30 pm), null = cerrado
  horario: { 0: null, 1: [8, 18], 2: [8, 18], 3: [8, 18], 4: [8, 18], 5: [8, 18], 6: [8, 13] },
  cobertura: ['Apopa', 'Nejapa', 'Ciudad Delgado', 'Soyapango', 'Ilopango', 'San Salvador']
};
