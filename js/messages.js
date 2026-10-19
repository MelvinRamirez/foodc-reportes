// Catálogo centralizado de textos de UI en español. Ninguna vista debe
// hardcodear copy inline (mismo patrón que foodc-caja/js/messages.js).
// En esta unidad (R1) solo existe la pantalla de PIN; los textos del
// reporte (report-view, estados vacío/error/bloqueado) se agregan en R2.

export const messages = {
  pin: {
    title: 'Ingresá el PIN de caja',
    submit: 'Entrar',
    // auth.error states, ver reportes-access spec y el state shape auth.error.
    wrongPin: 'PIN incorrecto. Intente de nuevo.',
    offline: 'Sin conexión, reintente.',
    notConfigured: 'El PIN de caja no está configurado en el servidor. Avise al administrador.',
    contract: 'No se pudo validar el PIN (versión del servidor incompatible).',
  },
};
