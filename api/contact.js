export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "El body no es JSON válido" });
      }
    }

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "No se recibió el body correctamente" });
    }

    const { nombre, email, tipo_proyecto, mensaje } = body;

    if (!nombre || !email || !mensaje) {
      return res.status(400).json({
        error: "Faltan campos obligatorios",
        debug: { nombre, email, tipo_proyecto, mensaje }
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return res.status(500).json({ error: "Falta SUPABASE_URL en Vercel" });
    }

    if (!serviceKey) {
      return res.status(500).json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel" });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify([
        {
          nombre,
          email,
          tipo_proyecto: tipo_proyecto || null,
          mensaje,
          origen: "cathedralgroup.es"
        }
      ])
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(500).json({
        error: "Supabase devolvió error",
        details: text
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Lead guardado correctamente",
      details: text
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error interno del servidor",
      details: String(error)
    });
  }
}
