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

    const {
      nombre,
      email,
      tipo_proyecto,
      mensaje,
      empresa_web,
      "cf-turnstile-response": turnstileToken
    } = body;

    if (!nombre || !email || !mensaje) {
      return res.status(400).json({
        error: "Faltan campos obligatorios"
      });
    }
    
if (empresa_web && String(empresa_web).trim() !== "") {
  return res.status(400).json({
    error: "Formulario bloqueado"
  });
}
    if (empresa_web && String(empresa_web).trim() !== "") {
      return res.status(400).json({
        error: "Formulario bloqueado"
      });
    }

    const emailNormalizado = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(emailNormalizado)) {
      return res.status(400).json({
        error: "Email no válido"
      });
    }

    const blockedEmailDomains = [
      "mailinator.com",
      "guerrillamail.com",
      "10minutemail.com",
      "temp-mail.org",
      "tempmail.com",
      "yopmail.com",
      "dispostable.com",
      "sharklasers.com"
    ];

    const emailDomain = emailNormalizado.split("@")[1];

    if (blockedEmailDomains.includes(emailDomain)) {
      return res.status(400).json({
        error: "Email no permitido"
      });
    }

    const textoAnalisis =
      `${nombre} ${emailNormalizado} ${tipo_proyecto || ""} ${mensaje}`.toLowerCase();

    const spamKeywords = [
      "viagra",
      "casino",
      "crypto",
      "bitcoin",
      "forex",
      "seo expert",
      "buy now",
      "backlinks",
      "loan",
      "porn",
      "adult",
      "betting"
    ];

    const contieneSpam = spamKeywords.some((word) =>
      textoAnalisis.includes(word)
    );

    if (contieneSpam) {
      return res.status(400).json({
        error: "Mensaje bloqueado por filtro anti-spam"
      });
    }

    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;

    if (!turnstileSecret) {
      return res.status(500).json({
        error: "Falta TURNSTILE_SECRET_KEY en Vercel"
      });
    }

    if (!turnstileToken) {
      return res.status(400).json({
        error: "Falta validación Turnstile"
      });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "";

    const formData = new URLSearchParams();
    formData.append("secret", turnstileSecret);
    formData.append("response", turnstileToken);
    if (ip) formData.append("remoteip", ip);

    const turnstileResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString()
      }
    );

    const turnstileResult = await turnstileResponse.json();

    if (!turnstileResult.success) {
      return res.status(400).json({
        error: "Validación anti-bot no superada",
        details: turnstileResult["error-codes"] || []
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
          nombre: String(nombre).trim(),
          email: emailNormalizado,
          tipo_proyecto: tipo_proyecto ? String(tipo_proyecto).trim() : null,
          mensaje: String(mensaje).trim(),
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
      message: "Lead guardado correctamente"
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error interno del servidor",
      details: String(error)
    });
  }
}
