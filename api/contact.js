export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const { nombre, email, tipo_proyecto, mensaje } = req.body;

    if (!nombre || !email || !mensaje) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify([
        {
          nombre: nombre,
          email: email,
          tipo_proyecto: tipo_proyecto,
          mensaje: mensaje,
          origen: "cathedralgroup.es"
        }
      ])
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Supabase error:", error);
      return res.status(500).json({ error: "Error guardando lead" });
    }

    return res.status(200).json({ success: true });

  } catch (error) {

    console.error("API error:", error);
    return res.status(500).json({ error: "Error interno servidor" });

  }
}
