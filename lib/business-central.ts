// Integración con Business Central (Cloud) vía OData v4 + OAuth2 client credentials.
// Nunca importar desde el navegador: usa el Client Secret.

type ItemBC = {
  No: string;
  Description: string;
  Base_Unit_of_Measure: string;
  Common_Item_No: string;
  Unit_Price: number;
  Vendor_No: string;
};

type ProyectoBC = {
  No: string;
  Description: string;
  Status: string;
  Sell_to_Address: string;
  Sell_to_Post_Code: string;
  Sell_to_City: string;
  Sell_to_County: string;
};

type ProveedorBC = {
  No: string;
  Name: string;
};

type PedidoCompraBC = {
  No: string;
  Buy_from_Vendor_No: string;
  Status: string;
  Your_Reference: string;
};

type LineaPedidoCompraBC = {
  Document_No: string;
  No: string;
  Quantity: number;
  Quantity_Received: number;
  Expected_Receipt_Date: string | null;
};

let tokenCache: { token: string; expira: number } | null = null;

async function obtenerToken(): Promise<string> {
  // Reutiliza el token mientras no esté por expirar (evita pedir uno nuevo en cada llamada)
  if (tokenCache && tokenCache.expira > Date.now() + 30_000) {
    return tokenCache.token;
  }

  const tenantId = process.env.BC_TENANT_ID!;
  const clientId = process.env.BC_CLIENT_ID!;
  const clientSecret = process.env.BC_CLIENT_SECRET!;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://api.businesscentral.dynamics.com/.default',
  });

  const respuesta = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`No se pudo autenticar con Azure AD: ${texto}`);
  }

  const data = await respuesta.json();
  tokenCache = { token: data.access_token, expira: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

function urlServicioBC(servicio: string): string {
  const tenantId = process.env.BC_TENANT_ID!;
  const environment = process.env.BC_ENVIRONMENT!;
  const company = process.env.BC_COMPANY_NAME!;

  return `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${environment}/ODataV4/Company('${encodeURIComponent(
    company
  )}')/${servicio}`;
}

async function consultarBC(url: string) {
  const token = await obtenerToken();

  const respuesta = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`Error consultando Business Central: ${respuesta.status} ${texto}`);
  }

  const data = await respuesta.json();
  return data.value;
}

export async function obtenerItemsComunesBC(): Promise<ItemBC[]> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE!);
  const url = `${base}?$filter=${encodeURIComponent("Common_Item_No ne ''")}`;
  return consultarBC(url);
}

export async function obtenerProyectosBC(): Promise<ProyectoBC[]> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_PROYECTOS!);
  return consultarBC(base);
}

export async function obtenerProveedoresBC(): Promise<ProveedorBC[]> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_PROVEEDORES!);
  return consultarBC(base);
}

// Busca el pedido de compra en BC cuya "Su Referencia" (Your_Reference) coincide
// con el Nº de pedido APP. Devuelve null si no existe (aún no se ha lanzado el
// pedido de compra en BC para esta solicitud).
export async function obtenerPedidoCompraBC(numeroApp: string): Promise<PedidoCompraBC | null> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_PEDIDOS_COMPRA!);
  const filtro = `Your_Reference eq '${numeroApp.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  const resultados: PedidoCompraBC[] = await consultarBC(url);
  return resultados[0] || null;
}

// Líneas de un pedido de compra concreto en BC (por Nº pedido Tecmelec / Document_No),
// para calcular el estado de recepción de cada artículo (Quantity vs Quantity_Received).
export async function obtenerLineasPedidoCompraBC(documentNo: string): Promise<LineaPedidoCompraBC[]> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_LINEAS_COMPRA!);
  const filtro = `Document_No eq '${documentNo.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  return consultarBC(url);
}
