# Equivalencias bimonetarias con cotización seleccionable en Lita

Lita obtiene precios **solo desde LTC**, que reutiliza su servicio DolarAPI. El iframe no llama por su cuenta a un proveedor con datos de usuarios.

## Experiencia móvil

En **Transacciones**, un selector permite elegir MEP (predeterminado), CCL, oficial, blue o cripto y refrescar los precios. Se muestra mercado, precio comprador y actualización; la selección afecta **consultas nuevas**, no respuestas históricas ya guardadas. Sin datos vigentes, se responde en ARS y USD por separado y **no se inventa una tasa**.

Para consultas de ahorro, Lita recupera los seis meses completos desde la consulta ya autenticada en LTC y pasa una cotización validada a `formatVerifiedSavingsAnswer`. La respuesta muestra **arriba** flujos ARS y USD, las entradas `Ingreso divisas` como fondos sin atribuir su origen, saldos registrados de Portfolio, la tasa y posibles equivalencias. Una divulgación nativa **«Ver detalles del cálculo y supuestos»** mantiene las advertencias y metodología accesibles sin saturar la pantalla. Funciona también al abrir conversaciones guardadas; las respuestas antiguas se mantienen intactas.

`src/lib/litaFxQuotes.ts` valida mercado permitido, precios positivos, fecha e intervalo de frescura (hasta 96 horas (cotizaciones de último cierre entre 36 y 96 horas se identifican expresamente como no actualizadas)). Si faltan gastos USD comparables, **no** estima un ahorro global aunque tenga un precio válido.

### Direcciones y prevención de doble conteo

- USD de posiciones registrado a ARS: `USD × compra`; si hay posiciones ARS, se puede sumar **solo dentro del mismo Portfolio**, nunca volver a sumar Bancos. La equivalencia no garantiza liquidez ni precio de venta de un instrumento financiero.
- Brecha mensual ARS expresada como USD a vender: `abs(brechaARS)/compra`. Es una hipótesis al precio de hoy, no una orden de venta ni una afirmación de déficit patrimonial.
- Con flujo neto verificado en **ambas** monedas, un neto USD positivo usa `compra`; un neto negativo usa `venta`. Sin ambas series completas, no se produce equivalente combinado.
- Entradas de divisas, transferencias, compraventas y activos **no se contabilizan como sueldo, ingresos económicos ni ahorro nuevo**.
- Tipo de cambio al momento de consulta (no histórico), mercado, fecha de actualización, comisiones e impuestos no incluidos. El endpoint de chat por LLM no recibe automáticamente posiciones privadas ni puede inventar FX.

### Validación

`tests/lita-fx-quotes.test.mjs` comprueba markets, fechas vencidas, signos, sentido comprador-vendedor, Portfolio y la limitación de USD sin historial. La prueba local y Next build se ejecutan en el workflow `Financial scope guard`.

**Publicación:** merge LTC host primero y Lita después; verificar manualmente que Vercel despliegue cada commit de `main` en Production (no Preview).

En fin de semana o feriado algunos mercados conservan el último cierre: **mostrar la fecha y la advertencia de actualización pendiente**, sin presentarlo como precio operativo de hoy. Los precios que superan 96 horas se rechazan y no generan equivalencias.
