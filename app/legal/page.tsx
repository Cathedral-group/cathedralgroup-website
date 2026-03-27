export default function LegalPage() {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <h1 className="text-2xl font-medium uppercase tracking-wide mb-8">Aviso Legal</h1>

        <div className="prose prose-neutral prose-sm max-w-none space-y-6 text-neutral-700">
          <h2 className="text-sm font-bold uppercase tracking-widest">Datos del titular</h2>
          <p>
            Cathedral House Investment S.L.<br />
            CIF: [Pendiente]<br />
            Paseo de la Castellana 40, 8º, 28046 Madrid<br />
            Email: info@cathedralgroup.es<br />
            Teléfono: +34 684 725 606
          </p>

          <h2 className="text-sm font-bold uppercase tracking-widest mt-8">Propiedad intelectual</h2>
          <p>
            Todo el contenido de este sitio web, incluyendo textos, imágenes, diseños, logotipos y marcas,
            es propiedad de Cathedral House Investment S.L. o de terceros que han autorizado su uso.
            Queda prohibida su reproducción sin autorización expresa.
          </p>

          <h2 className="text-sm font-bold uppercase tracking-widest mt-8">Política de privacidad</h2>
          <p>
            Los datos personales facilitados a través del formulario de contacto serán tratados con la
            finalidad de atender su solicitud. No se cederán a terceros salvo obligación legal.
            Puede ejercer sus derechos de acceso, rectificación, supresión y portabilidad escribiendo a
            info@cathedralgroup.es.
          </p>

          <h2 className="text-sm font-bold uppercase tracking-widest mt-8">Cookies</h2>
          <p>
            Este sitio web utiliza cookies técnicas necesarias para su funcionamiento. No se utilizan
            cookies de seguimiento ni analíticas sin su consentimiento previo.
          </p>
        </div>
      </div>
    </section>
  )
}
