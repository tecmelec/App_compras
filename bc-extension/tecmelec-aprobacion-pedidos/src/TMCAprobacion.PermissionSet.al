/// Asignar al usuario de aplicación de BC que usa la app (el registro de Azure AD
/// de BC_CLIENT_ID), además de los permisos que ya tiene para crear pedidos.
permissionset 50100 "TMC APROBACION"
{
    Assignable = true;
    Caption = 'Tecmelec - Enviar pedidos a aprobación desde la App';
    Permissions =
        codeunit "TMC Aprobacion Pedido Compra" = X;
}
