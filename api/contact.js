export default async function handler(req, res) {

if (req.method !== "POST") {
return res.status(405).json({ error: "Method not allowed" });
}

const { nombre, email, tipo_proyecto, mensaje } = req.body;

if (!nombre || !email || !mensaje) {
return res.status(400).json({ error: "Faltan campos obligatorios" });
}

console.log("Nuevo lead:", {
nombre,
email,
tipo_proyecto,
mensaje
});

return res.status(200).json({ ok: true });

}
