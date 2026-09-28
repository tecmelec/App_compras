/// <summary>
/// Llamado desde la app Tienda Tecmelec justo después de crear un pedido de compra.
/// Hace lo mismo que el botón "Solicitar aprobación > Enviar solicitud aprobación"
/// del pedido de compra, para que arranque el flujo de trabajo de aprobación.
///
/// Se publica en la página "Servicios web" como:
///   Tipo de objeto: Codeunit · Id. objeto: 50100 · Nombre servicio: TMCAprobacionPedidos · Publicado: Sí
/// y la app lo invoca con:
///   POST .../ODataV4/TMCAprobacionPedidos_EnviarAprobacion?company=...  { "documentNo": "PC2608176" }
/// </summary>
codeunit 50100 "TMC Aprobacion Pedido Compra"
{
    procedure EnviarAprobacion(documentNo: Text): Text
    var
        PurchaseHeader: Record "Purchase Header";
        ApprovalsMgmt: Codeunit "Approvals Mgmt.";
    begin
        if not PurchaseHeader.Get(PurchaseHeader."Document Type"::Order, CopyStr(documentNo, 1, MaxStrLen(PurchaseHeader."No."))) then
            Error('No existe el pedido de compra %1.', documentNo);

        // Si ya no está abierto (ya enviado a aprobación o lanzado), no se hace nada.
        if PurchaseHeader.Status <> PurchaseHeader.Status::Open then
            exit(Format(PurchaseHeader.Status, 0, 9));

        // Mismas comprobaciones y mismo evento que usa el botón estándar de la página
        // de pedido de compra. Si no hay flujo de aprobación activo, da error.
        if ApprovalsMgmt.CheckPurchaseApprovalPossible(PurchaseHeader) then
            ApprovalsMgmt.OnSendPurchaseDocForApproval(PurchaseHeader);

        PurchaseHeader.Get(PurchaseHeader."Document Type", PurchaseHeader."No.");
        exit(Format(PurchaseHeader.Status, 0, 9));
    end;
}
