/// <summary>
/// Llamado desde la app Tienda Tecmelec justo después de crear un pedido de compra.
/// Hace lo mismo que el botón "Solicitar aprobación > Enviar solicitud aprobación"
/// del pedido de compra, para que arranque el flujo de trabajo de aprobación.
///
/// Se publica en la página "Servicios web" como:
///   Tipo de objeto: Codeunit · Id. objeto: 50160 · Nombre servicio: TMCAprobacionPedidos · Publicado: Sí
/// y la app lo invoca con:
///   POST .../ODataV4/TMCAprobacionPedidos_EnviarAprobacionComo?company=...
///        { "documentNo": "PC2608176", "bcUserSecurityId": "f93e1b3c-..." }
///   (o TMCAprobacionPedidos_EnviarAprobacion con solo documentNo, si quien lo
///    pulsa no tiene usuario de BC configurado en la app)
/// </summary>
codeunit 50160 "TMC Aprobacion Pedido Compra"
{
    /// Envía a aprobación como el usuario de aplicación (sin comprador concreto).
    procedure EnviarAprobacion(documentNo: Text): Text
    var
        PurchaseHeader: Record "Purchase Header";
    begin
        ObtenerPedido(documentNo, PurchaseHeader);
        if PurchaseHeader.Status <> PurchaseHeader.Status::Open then
            exit(Format(PurchaseHeader.Status, 0, 9));

        Enviar(PurchaseHeader);
        exit(Format(PurchaseHeader.Status, 0, 9));
    end;

    /// Envía a aprobación "en nombre de" el comprador que pulsó el botón en la app:
    /// - La cadena de aprobadores es la del comprador: antes de enviar se copian su
    ///   aprobador y límites (Configuración de usuarios de aprobación) en la ficha del
    ///   usuario de aplicación, que es quien técnicamente ejecuta el envío.
    /// - Después, el comprador queda como remitente de los movimientos de aprobación
    ///   (le llegan los avisos de aprobado/rechazado y lo ve en "Solicitudes enviadas")
    ///   y como "Id. usuario asignado" del pedido.
    procedure EnviarAprobacionComo(documentNo: Text; bcUserSecurityId: Text): Text
    var
        PurchaseHeader: Record "Purchase Header";
        ApprovalEntry: Record "Approval Entry";
        User: Record User;
        UserSetupComprador: Record "User Setup";
        UserSetupApp: Record "User Setup";
        IdSeguridad: Guid;
        UsuarioComprador: Code[50];
        UsuarioApp: Code[50];
    begin
        if not Evaluate(IdSeguridad, bcUserSecurityId) then
            Error('El ID de usuario de BC "%1" no es válido.', bcUserSecurityId);
        if not User.Get(IdSeguridad) then
            Error('No existe en Business Central ningún usuario con ID %1.', bcUserSecurityId);
        UsuarioComprador := CopyStr(User."User Name", 1, MaxStrLen(UsuarioComprador));

        if not UserSetupComprador.Get(UsuarioComprador) then
            Error('El usuario %1 no está dado de alta en Configuración de usuarios de aprobación.', UsuarioComprador);

        UsuarioApp := CopyStr(UserId(), 1, MaxStrLen(UsuarioApp));
        if UsuarioApp = '' then
            Error('El usuario de aplicación de la app no tiene "Nombre de usuario" en BC (página Usuarios). Asígnale uno, p. ej. APP_COMPRAS.');

        ObtenerPedido(documentNo, PurchaseHeader);
        if PurchaseHeader.Status <> PurchaseHeader.Status::Open then
            exit(Format(PurchaseHeader.Status, 0, 9));

        // 1) Misma cadena de aprobación que tendría el comprador.
        if not UserSetupApp.Get(UsuarioApp) then begin
            UserSetupApp.Init();
            UserSetupApp."User ID" := UsuarioApp;
            UserSetupApp.Insert();
        end;
        UserSetupApp."Approver ID" := UserSetupComprador."Approver ID";
        UserSetupApp."Purchase Amount Approval Limit" := UserSetupComprador."Purchase Amount Approval Limit";
        UserSetupApp."Unlimited Purchase Approval" := UserSetupComprador."Unlimited Purchase Approval";
        UserSetupApp."Request Amount Approval Limit" := UserSetupComprador."Request Amount Approval Limit";
        UserSetupApp."Unlimited Request Approval" := UserSetupComprador."Unlimited Request Approval";
        UserSetupApp."Salespers./Purch. Code" := UserSetupComprador."Salespers./Purch. Code";
        UserSetupApp.Modify();

        // 2) El pedido queda asignado al comprador.
        PurchaseHeader."Assigned User ID" := UsuarioComprador;
        PurchaseHeader.Modify();

        // 3) Envío estándar a aprobación.
        Enviar(PurchaseHeader);

        // 4) El comprador figura como remitente de la solicitud.
        ApprovalEntry.SetRange("Table ID", Database::"Purchase Header");
        ApprovalEntry.SetRange("Document Type", ApprovalEntry."Document Type"::Order);
        ApprovalEntry.SetRange("Document No.", PurchaseHeader."No.");
        ApprovalEntry.SetRange("Sender ID", UsuarioApp);
        ApprovalEntry.ModifyAll("Sender ID", UsuarioComprador);

        exit(Format(PurchaseHeader.Status, 0, 9));
    end;

    local procedure ObtenerPedido(documentNo: Text; var PurchaseHeader: Record "Purchase Header")
    begin
        if not PurchaseHeader.Get(PurchaseHeader."Document Type"::Order, CopyStr(documentNo, 1, MaxStrLen(PurchaseHeader."No."))) then
            Error('No existe el pedido de compra %1.', documentNo);
    end;

    local procedure Enviar(var PurchaseHeader: Record "Purchase Header")
    var
        ApprovalsMgmt: Codeunit "Approvals Mgmt.";
    begin
        // Mismas comprobaciones y mismo evento que usa el botón estándar de la página
        // de pedido de compra. Si no hay flujo de aprobación activo, da error.
        if ApprovalsMgmt.CheckPurchaseApprovalPossible(PurchaseHeader) then
            ApprovalsMgmt.OnSendPurchaseDocForApproval(PurchaseHeader);
        PurchaseHeader.Get(PurchaseHeader."Document Type", PurchaseHeader."No.");
    end;
}
