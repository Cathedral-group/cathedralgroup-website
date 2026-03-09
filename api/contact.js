export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { nombre, email, tipo_proyecto, mensaje } = req.body;

    if (!nombre || !email || !mensaje) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: "Faltan variables de entorno en Vercel" });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Prefer": "return=representation"
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

    const responseText = await response.text();

    if (!response.ok) {
      console.error("Supabase error:", responseText);
      return res.status(500).json({ error: `Supabase error: ${responseText}` });
    }

    return res.status(200).json({ ok: true, message: "Lead guardado correctamente" });
  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
