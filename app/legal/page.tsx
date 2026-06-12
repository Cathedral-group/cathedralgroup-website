export const metadata = {
  title: 'Aviso Legal',
  description: 'Aviso legal, política de privacidad y condiciones de uso del sitio web de Cathedral Group.',
  alternates: { canonical: '/legal' },
}

export default function LegalPage() {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <h1 className="text-2xl font-medium uppercase tracking-wide mb-8">Aviso Legal</h1>

        <div className="prose prose-neutral prose-sm max-w-none space-y-6 text-neutral-700">
          <h2 className="text-sm font-bold uppercase tracking-widest">Datos del titular</h2>
          <p>
            Cathedral House Investment S.L.<br />
            CIF: B19761915<br />
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

          <h2 id="privacidad" className="text-sm font-bold uppercase tracking-widest mt-8 scroll-mt-28">Política de privacidad</h2>
          <p>
            Responsable del tratamiento: Cathedral House Investment S.L. (CIF B19761915),
            Paseo de la Castellana 40, 8º, 28046 Madrid — info@cathedralgroup.es.
          </p>
          <p>
            Los datos personales facilitados a través de los formularios de este sitio (contacto y
            calculadora de presupuesto) se tratan con la única finalidad de atender su solicitud y
            elaborar la propuesta que nos pide, sobre la base de las medidas precontractuales que
            usted solicita (art. 6.1.b RGPD). Se conservarán mientras dure la relación y los plazos
            legales aplicables. No se ceden a terceros salvo obligación legal.
          </p>
          <p>
            Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y
            portabilidad escribiendo a info@cathedralgroup.es. Si considera que el tratamiento no se
            ajusta a la normativa, puede reclamar ante la Agencia Española de Protección de Datos
            (aepd.es).
          </p>

          <h2 id="cookies" className="text-sm font-bold uppercase tracking-widest mt-8 scroll-mt-28">Cookies</h2>
          <p>
            Este sitio web utiliza cookies técnicas necesarias para su funcionamiento y cookies de
            análisis de Google Analytics para medir el uso del sitio de forma agregada.
          </p>
        </div>
      </div>
    </section>
  )
}
