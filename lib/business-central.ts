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
  Address?: string;
  Address_2?: string;
  City?: string;
  Post_Code?: string;
  County?: string;
  Country_Region_Code?: string;
  VAT_Registration_No?: string;
};

type PedidoCompraBC = {
  No: string;
  Buy_from_Vendor_No: string;
  Status: string;
  Your_Reference: string;
  Order_Date?: string;
};

type FichaProveedorBC = {
  No: string;
  Payment_Terms_Code?: string;
  Payment_Method_Code?: string;
  Preferred_Bank_Account_Code?: string;
  E_Mail?: string;
};

type CuentaBancariaProveedorBC = {
  Vendor_No: string;
  Code: string;
  Name?: string;
  IBAN?: string;
};

type LineaPedidoCompraBC = {
  Document_No: string;
  No: string;
  Quantity: number;
  Quantity_Received: number;
  Expected_Receipt_Date: string | null;
  Line_Amount: number;
  // No van en el $select de las lecturas normales, pero BC los incluye igual
  // por defecto en cada registro — los necesitamos solo para poder escribir
  // de vuelta en esta línea concreta (Document_Type + Line_No forman la
  // clave junto con Document_No; el etag es el control de concurrencia que
  // exige BC en cualquier PATCH).
  Document_Type?: string;
  Line_No?: number;
  '@odata.etag'?: string;
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
  )}')/${encodeURIComponent(servicio)}`;
}

// Base de la API estándar de Business Central (v2.0), distinta de las páginas
// OData personalizadas (_Excel) que usamos en el resto de la integración.
function urlApiEstandarBC(ruta: string): string {
  const tenantId = process.env.BC_TENANT_ID!;
  const environment = process.env.BC_ENVIRONMENT!;

  return `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${environment}/api/v2.0/${ruta}`;
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

// Crea un registro nuevo en BC vía POST. Devuelve el registro creado tal cual
// lo confirma BC (incluye el Nº asignado por la serie de numeración, etc.).
async function crearRegistroBC(url: string, cuerpo: Record<string, any>) {
  const token = await obtenerToken();

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cuerpo),
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`Error creando registro en Business Central: ${respuesta.status} ${texto}`);
  }

  return respuesta.json();
}

// Actualiza (PATCH) un registro ya existente en BC. Requiere el etag que BC
// devolvió al leerlo (control de concurrencia); si no lo tenemos, se manda
// '*' para saltárselo, aunque lo normal es tenerlo siempre que el registro
// se acaba de consultar justo antes.
async function actualizarRegistroBC(url: string, etag: string | undefined, cuerpo: Record<string, any>) {
  const token = await obtenerToken();

  const respuesta = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'If-Match': etag || '*',
    },
    body: JSON.stringify(cuerpo),
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`Error actualizando registro en Business Central: ${respuesta.status} ${texto}`);
  }

  return respuesta.json();
}

// Actualiza la fecha de recepción esperada de una línea de pedido de compra
// ya existente en BC (Expected_Receipt_Date), a partir de una línea obtenida
// previamente con obtenerLineasPedidoCompraBC (necesita su Document_No,
// Line_No y etag). Si BC tiene el documento en un estado que no permite
// tocar esa línea (p. ej. bloqueada), lanza y quien llame decide si es
// crítico o solo se registra el aviso.
export async function actualizarFechaEntregaLineaCompraBC(
  linea: LineaPedidoCompraBC,
  fecha: string
): Promise<void> {
  if (linea.Line_No === undefined) {
    throw new Error('La línea de BC no trae Line_No, no se puede localizar para actualizarla.');
  }

  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_LINEAS_COMPRA!);
  const documentType = linea.Document_Type || 'Order';
  const url = `${base}(Document_Type='${documentType.replace(/'/g, "''")}',Document_No='${linea.Document_No.replace(
    /'/g,
    "''"
  )}',Line_No=${linea.Line_No})`;

  await actualizarRegistroBC(url, linea['@odata.etag'], { Expected_Receipt_Date: fecha });
}

export async function obtenerCrudoBC(servicio: string): Promise<any> {
  const base = urlServicioBC(servicio);
  return consultarBC(base);
}

export async function obtenerCrudoBCFiltrado(servicio: string, filtro: string): Promise<any> {
  const base = urlServicioBC(servicio);
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  return consultarBC(url);
}

// Diagnóstico de la API estándar (api/v2.0), para confirmar que el token
// tiene permiso ahí y ver los nombres de campo reales antes de escribir.
export async function obtenerCompaniaEstandarBC(nombre: string): Promise<any | null> {
  const url = urlApiEstandarBC('companies');
  const companias = await consultarBC(url);
  return (
    companias.find((c: any) => c.name === nombre || c.displayName === nombre) || companias[0] || null
  );
}

export async function obtenerCrudoEstandarBC(companyId: string, entidad: string): Promise<any> {
  const url = urlApiEstandarBC(`companies(${companyId})/${entidad}`);
  return consultarBC(url);
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

// Detalle (dirección, CIF) de un proveedor concreto, para imprimir en el PDF
// del pedido de compra. Si BC no devuelve algún campo, queda undefined y el
// PDF simplemente lo omite — no lanza error.
export async function obtenerProveedorPorNumeroBC(bcProveedorNo: string): Promise<ProveedorBC | null> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_PROVEEDORES!);
  const filtro = `No eq '${bcProveedorNo.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  const resultados: ProveedorBC[] = await consultarBC(url);
  return resultados[0] || null;
}

// Cabecera de un pedido de compra por su Nº de documento (Nº pedido Tecmelec),
// para sacar la fecha de emisión al imprimir el PDF.
export async function obtenerPedidoCompraPorDocumentNoBC(documentNo: string): Promise<PedidoCompraBC | null> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_PEDIDOS_COMPRA!);
  const filtro = `No eq '${documentNo.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  const resultados: PedidoCompraBC[] = await consultarBC(url);
  return resultados[0] || null;
}

// Términos y método de pago del proveedor (códigos), y qué cuenta bancaria
// suya es la preferida — para el bloque "Forma de pago" / IBAN del PDF.
export async function obtenerFichaProveedorPorNumeroBC(bcProveedorNo: string): Promise<FichaProveedorBC | null> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_FICHA_PROVEEDOR!);
  const filtro = `No eq '${bcProveedorNo.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  const resultados: FichaProveedorBC[] = await consultarBC(url);
  return resultados[0] || null;
}

// Cuentas bancarias del proveedor (incluye el IBAN), para sacar la que
// coincide con su cuenta preferida.
export async function obtenerCuentasBancariasProveedorBC(
  bcProveedorNo: string
): Promise<CuentaBancariaProveedorBC[]> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_BANCO_PROVEEDOR!);
  const filtro = `Vendor_No eq '${bcProveedorNo.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  return consultarBC(url);
}

// Busca el pedido de compra en BC cuya "Su Referencia" (Your_Reference) coincide
// con el Nº de pedido APP. Devuelve null si no existe (aún no se ha lanzado el
// pedido de compra en BC para esta solicitud).
// OJO: una misma solicitud puede tener VARIOS pedidos de compra en BC (uno por
// proveedor, todos con la misma Your_Reference) — para sincronizar una solicitud
// completa hay que usar obtenerPedidosCompraBC (plural) y recorrerlos todos, no
// quedarse con el primero.
export async function obtenerPedidoCompraBC(numeroApp: string): Promise<PedidoCompraBC | null> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_PEDIDOS_COMPRA!);
  const filtro = `Your_Reference eq '${numeroApp.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  const resultados: PedidoCompraBC[] = await consultarBC(url);
  return resultados[0] || null;
}

// Igual que obtenerPedidoCompraBC pero devuelve TODOS los pedidos de compra que
// comparten esa Your_Reference (una solicitud puede generar un pedido de compra
// por cada proveedor distinto).
export async function obtenerPedidosCompraBC(numeroApp: string): Promise<PedidoCompraBC[]> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_PEDIDOS_COMPRA!);
  const filtro = `Your_Reference eq '${numeroApp.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  return consultarBC(url);
}

// Líneas de un pedido de compra concreto en BC (por Nº pedido Tecmelec / Document_No),
// para calcular el estado de recepción de cada artículo (Quantity vs Quantity_Received).
export async function obtenerLineasPedidoCompraBC(documentNo: string): Promise<LineaPedidoCompraBC[]> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_LINEAS_COMPRA!);
  const filtro = `Document_No eq '${documentNo.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  return consultarBC(url);
}

// Crea la cabecera de un pedido de compra nuevo en BC. Devuelve el registro
// creado (incluye el Nº asignado por la serie de numeración de BC).
export async function crearPedidoCompraBC(datos: {
  Buy_from_Vendor_No: string;
  Your_Reference: string;
  Ship_to_Name?: string;
  Ship_to_Address?: string;
  Ship_to_City?: string;
  Ship_to_County?: string;
  Ship_to_Post_Code?: string;
}): Promise<PedidoCompraBC> {
  const url = urlServicioBC(process.env.BC_ODATA_SERVICE_PEDIDOS_COMPRA!);
  return crearRegistroBC(url, datos);
}

// Crea una línea dentro de un pedido de compra ya existente en BC.
export async function crearLineaPedidoCompraBC(datos: {
  Document_Type: string;
  Document_No: string;
  Type: string;
  No: string;
  Quantity: number;
  Direct_Unit_Cost: number;
  Job_No?: string;
  Job_Task_No?: string;
  Job_Planning_Line_No?: number;
}): Promise<any> {
  const url = urlServicioBC(process.env.BC_ODATA_SERVICE_LINEAS_COMPRA!);
  return crearRegistroBC(url, datos);
}

// Comprueba si una tarea de proyecto (Job_Task_No) existe dentro de una obra
// (Job_No) concreta, antes de asignarla en una línea de compra.
export async function existeTareaProyectoBC(jobNo: string, jobTaskNo: string): Promise<boolean> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_TAREAS_PROYECTO!);
  const filtro = `Job_No eq '${jobNo.replace(/'/g, "''")}' and Job_Task_No eq '${jobTaskNo.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}`;
  const resultados = await consultarBC(url);
  return resultados.length > 0;
}

// Nº de línea más alto ya usado en las líneas de planificación de una
// obra/tarea, para poder calcular el siguiente sin colisionar (BC los
// numera de 10000 en 10000, igual que casi todas sus líneas de documento).
export async function obtenerMaxLineaPlanificacionBC(jobNo: string, jobTaskNo: string): Promise<number> {
  const base = urlServicioBC(process.env.BC_ODATA_SERVICE_LINEAS_PLANIFICACION!);
  const filtro = `Job_No eq '${jobNo.replace(/'/g, "''")}' and Job_Task_No eq '${jobTaskNo.replace(/'/g, "''")}'`;
  const url = `${base}?$filter=${encodeURIComponent(filtro)}&$select=Line_No&$orderby=Line_No desc&$top=1`;
  const resultados = await consultarBC(url);
  return resultados[0]?.Line_No || 0;
}

// Crea una nueva línea de planificación de proyecto (presupuesto) para un
// artículo, dentro de una obra/tarea concreta.
export async function crearLineaPlanificacionBC(datos: {
  Job_No: string;
  Job_Task_No: string;
  Line_No: number;
  Line_Type: string;
  Type: string;
  No: string;
  Planning_Date?: string;
}): Promise<any> {
  const url = urlServicioBC(process.env.BC_ODATA_SERVICE_LINEAS_PLANIFICACION!);
  return crearRegistroBC(url, datos);
}
