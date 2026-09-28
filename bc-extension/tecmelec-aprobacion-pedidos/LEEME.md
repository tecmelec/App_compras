# Extensión BC: enviar pedidos de compra a aprobación desde la app

Business Central no permite llamar desde fuera (API ni OData de página) a la acción
**"Solicitar aprobación → Enviar solicitud aprobación"** del pedido de compra. Esta
extensión mínima expone ese mismo proceso como servicio web para que la app
Tienda Tecmelec lo lance automáticamente justo después de crear el pedido.

## Contenido
- `src/AprobacionPedidoCompra.Codeunit.al` — codeunit 50160 con el procedimiento
  `EnviarAprobacion(documentNo)`. Llama a `Approvals Mgmt.`
  (`CheckPurchaseApprovalPossible` + `OnSendPurchaseDocForApproval`), igual que el botón estándar.
- `src/TMCAprobacion.PermissionSet.al` — conjunto de permisos `TMC APROBACION`.

> Revisar antes de compilar: el rango de IDs (50160–50169) no debe chocar con otras
> extensiones del entorno, y `application`/`runtime` de `app.json` deben corresponder
> a la versión de BC (ahora 24.0 / runtime 13.0).

## Pasos en Business Central
1. Compilar e instalar la extensión (VS Code + AL Language, o subir el `.app` en
   *Administración de extensiones*). Probar primero en un entorno sandbox si existe.
2. **Servicios web** → Nuevo:
   - Tipo de objeto: **Codeunit** · Id. objeto: **50160**
   - Nombre del servicio: **TMCAprobacionPedidos** · Publicado: **Sí**
3. **Usuarios** → el usuario de aplicación de la app (registro de Azure AD de `BC_CLIENT_ID`)
   → añadir el conjunto de permisos **TMC APROBACION**.
4. **Configuración de usuarios de aprobación**: el flujo *MS-POAPW-01* envía la solicitud
   en nombre de quien la lanza, que aquí es ese **usuario de aplicación**. Si el tipo de
   aprobador del flujo es "Aprobador" (cadena de Configuración de usuarios de aprobación),
   ese usuario tiene que estar dado de alta ahí con su aprobador; si no, BC da error al enviar.

## Paso en la app (Vercel)
Añadir la variable de entorno `BC_ODATA_SERVICE_APROBACION = TMCAprobacionPedidos`
(en *Preview* para probar en la rama de prueba y en *Production* después) y volver a desplegar.
Mientras la variable no exista, la app crea los pedidos como hasta ahora (en "Abierto")
y no intenta enviarlos a aprobación.

## Prueba manual (opcional)
```
POST https://api.businesscentral.dynamics.com/v2.0/{tenant}/{entorno}/ODataV4/TMCAprobacionPedidos_EnviarAprobacion?company={empresa}
Authorization: Bearer {token}
Content-Type: application/json

{ "documentNo": "PC2608176" }
```
Respuesta esperada: `{ "value": "Pending Approval" }` (o `Released` si el flujo lo aprueba directamente).
