// Datos fijos de Tecmelec para el membrete del PDF de pedido de compra.
// Si cambian (dirección, IBAN, teléfono...), se edita solo aquí.
export const EMPRESA = {
  nombre: 'Tecmelec Electricidad S.L.',
  cif: 'B86590924',
  direccion: 'PJ ARROYO VALSEQUILLO 64 POLÍGONO 30, 28294 ROBLEDO DE CHAVELA (Madrid)',
  telefono: '910494804',
  email: 'info@tecmelec.es',
  registroMercantil:
    'Tecmelec Electricidad, S.L. - Reg. Merc. De Madrid, Tomo 30.452, Folio 71, Sección 8, Hoja M-548025, Inscripción 1 - Cif: B86590924',
  // TODO: rellenar con el IBAN real (enmascarado, ej. "ES12 **** **** **** **** 4694") antes de publicar.
  ibanEnmascarado: 'ES******************4694',
  formaPago: 'Transf. bancaria - 30 Dias Fecha Factura',
  ivaPorcentaje: 21,
};
