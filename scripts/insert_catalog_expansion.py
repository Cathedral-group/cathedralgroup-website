#!/usr/bin/env python3
"""
Catalog expansion: adds ~250 new items across thin chapters.
Chapters: 02, 05, 07, 08, 09, 11, 14, 17, 18, 19, 20, 21, 24, 25
2026 market prices for Spain (CYPE + Habitissimo + field data).
"""
import json, urllib.request, urllib.error, time

SUPABASE_URL = "https://cpqsnajuypgjjapvbqsr.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwcXNuYWp1eXBnamphcHZicXNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzA1ODU2OCwiZXhwIjoyMDg4NjM0NTY4fQ.SkmWcPSkISzQHFhqghCqQJZssWMCNn4cQIqFqq84QEk"

ITEMS = [

  # ─── 02 TABIQUERÍA ──────────────────────────────────────────────────────────
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Ladrillo","description":"Tabique ladrillo cerámico perforado 11.5cm con enfoscado y guarnecido","unit":"m2","unit_price":62,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Ladrillo","description":"Tabique ladrillo silicio-calcáreo 10cm con guarnecido de yeso","unit":"m2","unit_price":75,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Ladrillo","description":"Muro de ladrillo cara vista interior aparejo soga","unit":"m2","unit_price":95,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Bloque","description":"Tabique bloque hormigón aligerado 15cm con guarnecido","unit":"m2","unit_price":88,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Bloque","description":"Tabique bloque de yeso laminado macizo 70mm (Ytong o similar)","unit":"m2","unit_price":72,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Vidrio","description":"Divisoria de vidrio laminado 6+6mm con perfilería aluminio natural","unit":"m2","unit_price":320,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Vidrio","description":"Mampara de vidrio templado 10mm sin perfilería a suelo y techo","unit":"m2","unit_price":450,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Pladur","description":"Tabique pladur con aislamiento acústico lana roca 70mm total 12+70+12","unit":"m2","unit_price":82,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Pladur","description":"Tabique pladur tipo W115 estructura doble con cámara 150mm total","unit":"m2","unit_price":95,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Pladur","description":"Tabique pladur alta resistencia antichoque tipo Fermacell 10mm","unit":"m2","unit_price":68,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Trasdosado","description":"Trasdosado de pared con lana de vidrio 60mm + pladur 13mm","unit":"m2","unit_price":48,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Reparacion","description":"Regata en tabique de ladrillo para paso de instalaciones — apertura y sellado","unit":"ml","unit_price":12,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Reparacion","description":"Apertura de hueco en tabique con moldura para puerta hasta 90x210cm","unit":"ud","unit_price":180,"active":True},
  {"chapter_code":"02","chapter_name":"Tabiqueria","subcategory":"Reparacion","description":"Cierre y remate de hueco existente en tabique ladrillo con guarnecido","unit":"ud","unit_price":220,"active":True},

  # ─── 05 TECHOS ──────────────────────────────────────────────────────────────
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Decoracion","description":"Roseta decorativa de escayola 40cm diámetro instalada","unit":"ud","unit_price":65,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Decoracion","description":"Friso de escayola perimetral tipo clásico 10cm montado","unit":"ml","unit_price":22,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Decoracion","description":"Viga decorativa de madera maciza de roble para techo visto — por ml","unit":"ml","unit_price":95,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Decoracion","description":"Viga decorativa de madera de pino pintada para techo rústico — por ml","unit":"ml","unit_price":55,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Continuo","description":"Enlucido de yeso en techo con acabado fino listo para pintar","unit":"m2","unit_price":18,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Continuo","description":"Falso techo de lamas metálicas lineales color blanco — 100x7mm","unit":"m2","unit_price":85,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Continuo","description":"Falso techo de lamas de aluminio extruido lacado grafito","unit":"m2","unit_price":110,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Madera","description":"Falso techo de bambú natural lacado en lamas 5cm","unit":"m2","unit_price":75,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Acústico","description":"Falso techo acústico de espuma poliuretano decorativa proyectable","unit":"m2","unit_price":55,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Continuo","description":"Rebaje perimetral de techo tipo cuna para iluminación indirecta","unit":"ml","unit_price":95,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Continuo","description":"Techo con falso techo de doble nivel — pladur con escalonado decorativo","unit":"m2","unit_price":72,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Especial","description":"Bóveda de escayola en techo tipo artesonado a medida","unit":"m2","unit_price":180,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Especial","description":"Lucernario fijo en cubierta con vidrio doble y perfilería aluminio","unit":"ud","unit_price":1200,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Especial","description":"Lucernario practicable con apertura motorizada — hasta 80x80cm","unit":"ud","unit_price":1800,"active":True},
  {"chapter_code":"05","chapter_name":"Techos","subcategory":"Aislamiento","description":"Aislamiento térmico proyectado en cámara de techo con poliuretano 40mm","unit":"m2","unit_price":28,"active":True},

  # ─── 07 CARPINTERÍA EXTERIOR ─────────────────────────────────────────────────
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"PVC","description":"Ventana PVC blanco 2 hojas 120x100 doble acristalamiento","unit":"ud","unit_price":490,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"PVC","description":"Ventana PVC blanco 2 hojas 150x120 — doble acristalamiento","unit":"ud","unit_price":620,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"PVC","description":"Puerta corredera PVC 2 hojas 200x210 doble acristalamiento","unit":"ud","unit_price":1100,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Aluminio RPT","description":"Ventana aluminio RPT 1 hoja 60x60 doble acristalamiento bajo emisivo","unit":"ud","unit_price":380,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Aluminio RPT","description":"Ventana aluminio RPT 2 hojas 150x120 doble acristalamiento","unit":"ud","unit_price":780,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Aluminio RPT","description":"Ventana aluminio RPT 3 hojas 200x120 doble acristalamiento","unit":"ud","unit_price":1050,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Aluminio RPT","description":"Puerta corredera aluminio RPT elevable 2 hojas 200x210","unit":"ud","unit_price":2200,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Aluminio RPT","description":"Puerta corredera aluminio RPT elevable 3 hojas 300x240","unit":"ud","unit_price":3200,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Aluminio RPT","description":"Sistema de fachada plegable tipo bifolding 4 hojas 320x240 aluminio","unit":"ud","unit_price":4800,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Aluminio RPT","description":"Puerta de entrada aluminio RPT doble hoja con vidrio decorativo","unit":"ud","unit_price":2800,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Madera","description":"Ventana madera meranti 2 hojas 120x120 con doble acristalamiento","unit":"ud","unit_price":950,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Madera","description":"Puerta balconera de madera lacada 2 hojas 140x220","unit":"ud","unit_price":1400,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Protecciones","description":"Persiana motorizada aluminio lacado con domótica Somfy","unit":"ud","unit_price":480,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Protecciones","description":"Toldo de brazos extensibles motorizado 3x2m tela acrílica","unit":"ud","unit_price":1400,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Protecciones","description":"Toldo de brazos extensibles motorizado 4x2.5m tela acrílica","unit":"ud","unit_price":1900,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Protecciones","description":"Mosquitera plisada para ventana hasta 80x120cm — instalada","unit":"ud","unit_price":220,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Protecciones","description":"Persiana exterior de aluminio inyectado motorizada y aislante","unit":"ud","unit_price":580,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Vidrio","description":"Acristalamiento doble bajo emisivo (4+12+4 argón) sustitución en ventana existente","unit":"m2","unit_price":95,"active":True},
  {"chapter_code":"07","chapter_name":"Carpinteria exterior","subcategory":"Vidrio","description":"Acristalamiento triple bajo emisivo 4+16+4 argón — alta eficiencia","unit":"m2","unit_price":145,"active":True},

  # ─── 08 ELECTRICIDAD ─────────────────────────────────────────────────────────
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Puntos","description":"Punto de luz con interruptor simple — incluye caja, cable y mecanismo gama básica","unit":"ud","unit_price":78,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Puntos","description":"Punto de conmutación con dos interruptores de escalera","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Puntos","description":"Punto de cruzamiento (escalera de 3 puntos)","unit":"ud","unit_price":110,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Puntos","description":"Punto de enchufe schuko doble — cableado, caja y base doble","unit":"ud","unit_price":85,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Puntos","description":"Punto de enchufe schuko con toma de tierra dedicada — circuito independiente","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Puntos","description":"Punto de TV/SAT con toma de señal coaxial empotrada","unit":"ud","unit_price":88,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Puntos","description":"Punto de datos RJ45 Cat6 con roseta keystone empotrada","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Puntos","description":"Punto de videodomófono — caja empotrada y cableado bus o IP","unit":"ud","unit_price":120,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Puntos","description":"Punto de timbre o pulsador — con cableado y caja","unit":"ud","unit_price":68,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Puntos","description":"Punto de enchufe exterior IP44 con tapa estanca","unit":"ud","unit_price":105,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Mecanismos","description":"Mecanismo interruptor simple gama media (BJC, Simon 82) instalado","unit":"ud","unit_price":28,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Mecanismos","description":"Mecanismo interruptor simple gama alta (Legrand Céliane, Jung, Gira) instalado","unit":"ud","unit_price":55,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Mecanismos","description":"Mecanismo dimmer/regulador empotrado gama media — hasta 300W LED","unit":"ud","unit_price":75,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Mecanismos","description":"Mecanismo dimmer/regulador inteligente Wifi gama alta (Legrand/Vimar)","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Mecanismos","description":"Mecanismo pulsador para timbre o campana instalado","unit":"ud","unit_price":22,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Cuadro","description":"Cuadro electrico 16 circuitos ICP + diferencial doble tarifa","unit":"ud","unit_price":820,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Cuadro","description":"Protector de sobretensiones transitoria clase II en cuadro","unit":"ud","unit_price":180,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Cuadro","description":"ICP y protecciones Acometida vivienda trifásica 3x25A instalado","unit":"ud","unit_price":380,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Seguridad","description":"Luminaria de emergencia autónoma de 100 lúmenes instalada","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Seguridad","description":"Detector de humo y monóxido de carbono WiFi instalado y programado","unit":"ud","unit_price":85,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Seguridad","description":"Videodomófono IP con pantalla 7 pulgadas color instalado","unit":"ud","unit_price":650,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Cargador","description":"Wallbox 7,4kW monofásico instalado con circuito dedicado","unit":"ud","unit_price":980,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Cargador","description":"Wallbox 11kW trifásico instalado con circuito dedicado","unit":"ud","unit_price":1300,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Cargador","description":"Wallbox 22kW trifásico con gestión de carga dinámica instalado","unit":"ud","unit_price":1800,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Solar","description":"Instalación solar fotovoltaica 3kWp autoconsumo + batería 5kWh","unit":"pa","unit_price":6800,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Solar","description":"Instalación solar fotovoltaica 10kWp autoconsumo unifamiliar","unit":"pa","unit_price":16000,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Solar","description":"Panel solar 400Wp monocristalino PERC instalado en cubierta — por panel","unit":"ud","unit_price":380,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Solar","description":"Inversor híbrido monofásico 5kW con gestor de baterías","unit":"ud","unit_price":1400,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Solar","description":"Batería de litio LiFePO4 5kWh para autoconsumo instalada","unit":"ud","unit_price":3200,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Domotica","description":"Sistema domótico KNX estancia completa (4 circuitos luz + 2 enchufes)","unit":"ud","unit_price":680,"active":True},
  {"chapter_code":"08","chapter_name":"Electricidad","subcategory":"Domotica","description":"Automatización de 4 persianas motorizadas con control central","unit":"pa","unit_price":1200,"active":True},

  # ─── 09 FONTANERÍA ───────────────────────────────────────────────────────────
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Puntos suministro","description":"Punto de suministro agua fría+caliente para lavabo con valvulería","unit":"ud","unit_price":120,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Puntos suministro","description":"Punto de suministro agua fría+caliente para ducha con valvulería","unit":"ud","unit_price":140,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Puntos suministro","description":"Punto de suministro agua fría+caliente para bañera con valvulería","unit":"ud","unit_price":160,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Puntos suministro","description":"Punto de suministro agua fría para inodoro con llave de corte","unit":"ud","unit_price":85,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Puntos suministro","description":"Punto de suministro agua fría+caliente para lavadora con toma y válvula","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Puntos suministro","description":"Punto de suministro agua fría+caliente para lavavajillas","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Puntos suministro","description":"Punto de suministro agua fría exterior grifo manguera","unit":"ud","unit_price":75,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Puntos suministro","description":"Punto de suministro agua fría+caliente para fregadero cocina","unit":"ud","unit_price":110,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Desague","description":"Punto de desagüe para lavabo con sifón de botella","unit":"ud","unit_price":85,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Desague","description":"Punto de desagüe para ducha con sifón de plato y bote","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Desague","description":"Punto de desagüe para inodoro con manguetón flexible y roseta","unit":"ud","unit_price":110,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Desague","description":"Punto de desagüe para lavadora con sifón y tapón anti-retorno","unit":"ud","unit_price":75,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Desague","description":"Bote sifónico DN110 para agrupación de desagües en baño","unit":"ud","unit_price":55,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Desague","description":"Red horizontal de saneamiento en PVC D=110mm — por ml","unit":"ml","unit_price":28,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Desague","description":"Red horizontal de saneamiento en PVC D=125mm — por ml","unit":"ml","unit_price":35,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Desague","description":"Red horizontal de saneamiento en PVC D=160mm colector general — por ml","unit":"ml","unit_price":45,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Tuberia","description":"Instalación de tubería multicapa Ø16mm para distribución interior — por ml","unit":"ml","unit_price":18,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Tuberia","description":"Instalación de tubería multicapa Ø20mm para distribución interior — por ml","unit":"ml","unit_price":22,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Tuberia","description":"Instalación de tubería multicapa Ø25mm distribución principal — por ml","unit":"ml","unit_price":28,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Tuberia","description":"Instalación tubería cobre Ø22mm para ACS retorno — por ml","unit":"ml","unit_price":32,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Valvuleria","description":"Válvula de corte general bola 1 pulgada en acometida vivienda","unit":"ud","unit_price":85,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Valvuleria","description":"Llave de corte de zona por circuito — instalada bajo suelo o trasdosado","unit":"ud","unit_price":45,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Valvuleria","description":"Reductor de presión DN20 con manómetro instalado","unit":"ud","unit_price":195,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Valvuleria","description":"Válvula antirretorno DN20 en acometida","unit":"ud","unit_price":45,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Valvuleria","description":"Contador de agua DN20 con armario de contador instalado","unit":"ud","unit_price":280,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Tratamiento","description":"Descalcificador doméstico 20L/min instalado + programado","unit":"ud","unit_price":980,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Tratamiento","description":"Ósmosis inversa de 5 etapas bajo fregadero instalada","unit":"ud","unit_price":580,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Tratamiento","description":"Filtro de partículas 50 micras en acometida de agua instalado","unit":"ud","unit_price":120,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Presion","description":"Grupo de presión doméstico 0,5HP para vivienda unifamiliar","unit":"ud","unit_price":480,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Presion","description":"Depósito de membrana de presión 8L instalado en fontanería","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"ACS","description":"Calentador de gas instantáneo 11L/min instalado (bajo consumo)","unit":"ud","unit_price":620,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"ACS","description":"Calentador de gas instantáneo 14L/min instalado","unit":"ud","unit_price":780,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"ACS","description":"Termo eléctrico 150L instalado — ACS para vivienda grande","unit":"ud","unit_price":580,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"ACS","description":"Bomba de calor aerotérmica para ACS 200L instalada","unit":"ud","unit_price":1800,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Saneamiento","description":"Arqueta sifónica 40x40cm con tapa de fundición en exterior","unit":"ud","unit_price":120,"active":True},
  {"chapter_code":"09","chapter_name":"Fontaneria","subcategory":"Saneamiento","description":"Pozos de registro de saneamiento DN600 prefabricado hormigón","unit":"ud","unit_price":480,"active":True},

  # ─── 11 PINTURA ──────────────────────────────────────────────────────────────
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Paredes","description":"Pintura plástica en paredes con imprimación previa — vivienda completa","unit":"m2","unit_price":10,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Paredes","description":"Pintura de microcemento fino sobre pared de yeso preparada — 2 capas","unit":"m2","unit_price":48,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Textura","description":"Pintura texturada tipo árido fino proyectado en paredes","unit":"m2","unit_price":16,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Textura","description":"Pintura decorativa estuco veneciano liso — 2 capas a espátula","unit":"m2","unit_price":58,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Textura","description":"Pintura de cal interior tipo Berliner Kalk o Bauwerk — 2 capas","unit":"m2","unit_price":32,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Papel pintado","description":"Colocación de papel pintado vinílico en paredes (sin suministro)","unit":"m2","unit_price":18,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Papel pintado","description":"Colocación de papel pintado no tejido premium tipo textil (sin suministro)","unit":"m2","unit_price":28,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Papel pintado","description":"Suministro + colocación papel pintado geométrico vinílico gama media","unit":"m2","unit_price":38,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Esmalte","description":"Esmalte al agua en rodapiés, molduras y marcos interiores","unit":"ml","unit_price":8,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Exterior","description":"Pintura siloxánica para fachada — alta durabilidad 10 años","unit":"m2","unit_price":18,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Exterior","description":"Pintura de fachada con fratasado previo y repasos de grietas","unit":"m2","unit_price":22,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Preparacion","description":"Lijado y plastecido de paredes antes de pintar — por m²","unit":"m2","unit_price":6,"active":True},
  {"chapter_code":"11","chapter_name":"Pintura","subcategory":"Preparacion","description":"Eliminación de pintura antigua con decapante o lija mecánica","unit":"m2","unit_price":12,"active":True},

  # ─── 14 VARIOS ───────────────────────────────────────────────────────────────
  {"chapter_code":"14","chapter_name":"Varios","subcategory":"Licencias","description":"Informe ITE — Inspección Técnica de Edificios","unit":"pa","unit_price":650,"active":True},
  {"chapter_code":"14","chapter_name":"Varios","subcategory":"Licencias","description":"Cédula de habitabilidad — trámites y visita técnica","unit":"pa","unit_price":480,"active":True},
  {"chapter_code":"14","chapter_name":"Varios","subcategory":"Residuos","description":"Gestión de residuos — contenedor 10m3 y valorización","unit":"ud","unit_price":350,"active":True},
  {"chapter_code":"14","chapter_name":"Varios","subcategory":"Varios","description":"Suministro provisional de agua de obra","unit":"pa","unit_price":280,"active":True},
  {"chapter_code":"14","chapter_name":"Varios","subcategory":"Varios","description":"Suministro provisional de electricidad de obra — grupo electrógeno o acometida","unit":"pa","unit_price":420,"active":True},
  {"chapter_code":"14","chapter_name":"Varios","subcategory":"Varios","description":"Caseta de obra para vestuario — alquiler mensual","unit":"ud","unit_price":180,"active":True},
  {"chapter_code":"14","chapter_name":"Varios","subcategory":"Varios","description":"Baño químico de obra — alquiler mensual","unit":"ud","unit_price":150,"active":True},

  # ─── 17 CERRAJERÍA ───────────────────────────────────────────────────────────
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Barandillas","description":"Barandilla de aluminio lacado blanco con vidrio laminado 8+8mm","unit":"ml","unit_price":320,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Barandillas","description":"Barandilla de acero pintado negro con balaustres verticales","unit":"ml","unit_price":180,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Barandillas","description":"Pasamanos de acero inox pulido DN50 en pared — por ml","unit":"ml","unit_price":95,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Barandillas","description":"Pasamanos de madera maciza de roble en escalera — por ml","unit":"ml","unit_price":75,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Rejas","description":"Reja enrollable de seguridad motorizada para local o garaje","unit":"m2","unit_price":280,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Puertas metálicas","description":"Puerta de chapa de acero pintada 90x210cm con marco y cerradura","unit":"ud","unit_price":480,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Puertas metálicas","description":"Puerta blindada de entrada RC2 con bombín seguridad y marcos","unit":"ud","unit_price":1400,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Puertas metálicas","description":"Puerta de garaje basculante motorizada chapa — hasta 2.5m ancho","unit":"ud","unit_price":1650,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Puertas metálicas","description":"Puerta de garaje abatible doble hoja motorizada con fotocelula","unit":"ud","unit_price":2200,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Puertas metálicas","description":"Puerta corredera de jardín motorizada — hasta 4m ancho chapa acero","unit":"ud","unit_price":2800,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Puertas metálicas","description":"Valla de cerramiento acero galvanizado panel con pilares — por ml","unit":"ml","unit_price":85,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Especial","description":"Estructura metálica para pérgola con cubierta policarbonato 3x4m","unit":"ud","unit_price":2400,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Especial","description":"Pérgola de aluminio bioclimática 4x3m con lamas orientables","unit":"ud","unit_price":5800,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Especial","description":"Taquilla metálica de obra para guardar herramientas — alquiler mensual","unit":"ud","unit_price":45,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Escalera","description":"Escalera de acero + madera diseño moderno — por peldaño incluyendo zanca","unit":"ud","unit_price":280,"active":True},
  {"chapter_code":"17","chapter_name":"Cerrajeria y metalisteria","subcategory":"Escalera","description":"Zanca de escalera de acero estructural pintada — por ml","unit":"ml","unit_price":320,"active":True},

  # ─── 18 ILUMINACIÓN ──────────────────────────────────────────────────────────
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Empotrable","description":"Downlight LED empotrado redondo 20W — apto baños IP44","unit":"ud","unit_price":75,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Empotrable","description":"Downlight LED empotrado cuadrado 12W regulable 3000K","unit":"ud","unit_price":65,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Empotrable","description":"Ojo de buey LED empotrable orientable 15W tipo shoplight negro","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Superficie","description":"Plafón LED de superficie 24W redondo 3000K/4000K","unit":"ud","unit_price":85,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Superficie","description":"Panel LED 60x60 36W empotrable o superficie instalado","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Superficie","description":"Aplique de pared LED 12W para interior — instalado","unit":"ud","unit_price":75,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Carril","description":"Foco para carril LED regulable CCT 15W tipo orientable negro","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Exterior","description":"Luminaria de jardín tipo balizas LED 5W IP65 — empotrable suelo","unit":"ud","unit_price":85,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Exterior","description":"Faro LED de fachada 20W IP65 con sensor de movimiento","unit":"ud","unit_price":120,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Exterior","description":"Proyector LED exterior 50W IP66 con soporte — para patio o garaje","unit":"ud","unit_price":145,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Exterior","description":"Farola de jardín LED 30W con columna 3m instalada","unit":"ud","unit_price":380,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Control","description":"Sensor de presencia empotrado 360° para control de luz","unit":"ud","unit_price":65,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Control","description":"Interruptor horario digital para luminarias exteriores","unit":"ud","unit_price":45,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Control","description":"Sistema de iluminación inteligente Philips Hue vivienda completa","unit":"pa","unit_price":1800,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Emergencia","description":"Luminaria de emergencia 1h 100 lm — instalada en zona común","unit":"ud","unit_price":95,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Emergencia","description":"Señal de emergencia LED permanente (SALIDA / EXIT) instalada","unit":"ud","unit_price":75,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Tira LED","description":"Perfil de aluminio con difusor para tira LED empotrado en nicho","unit":"ml","unit_price":22,"active":True},
  {"chapter_code":"18","chapter_name":"Iluminacion","subcategory":"Tira LED","description":"Tira LED de alta potencia 24V 18W/m tipo profesional IP20","unit":"ml","unit_price":45,"active":True},

  # ─── 19 GAS ──────────────────────────────────────────────────────────────────
  {"chapter_code":"19","chapter_name":"Gas","subcategory":"Calefaccion","description":"Caldera de gas mixta condensación 25kW — ACS + calefacción","unit":"ud","unit_price":2100,"active":True},
  {"chapter_code":"19","chapter_name":"Gas","subcategory":"Calefaccion","description":"Caldera de biomasa pellet 20kW instalada — vivienda unifamiliar","unit":"ud","unit_price":5800,"active":True},
  {"chapter_code":"19","chapter_name":"Gas","subcategory":"Calefaccion","description":"Radiador de aluminio de 7 elementos — instalado y conectado","unit":"ud","unit_price":180,"active":True},
  {"chapter_code":"19","chapter_name":"Gas","subcategory":"Calefaccion","description":"Radiador de acero plano de diseño 600x1000mm — instalado","unit":"ud","unit_price":280,"active":True},
  {"chapter_code":"19","chapter_name":"Gas","subcategory":"Calefaccion","description":"Toallero radiador de baño — acero cromado instalado con conexión","unit":"ud","unit_price":220,"active":True},
  {"chapter_code":"19","chapter_name":"Gas","subcategory":"Instalacion","description":"Punto de gas para cocina o caldera — toma en cobre hasta 5ml","unit":"ud","unit_price":180,"active":True},
  {"chapter_code":"19","chapter_name":"Gas","subcategory":"Instalacion","description":"Chimenea de gas biocombustible a bioetanol — instalada","unit":"ud","unit_price":2200,"active":True},
  {"chapter_code":"19","chapter_name":"Gas","subcategory":"Instalacion","description":"Legalización y certificado instalación gas + boletín","unit":"pa","unit_price":420,"active":True},

  # ─── 20 GESTIÓN ──────────────────────────────────────────────────────────────
  {"chapter_code":"20","chapter_name":"Gestion de obra","subcategory":"Proyecto","description":"Estudio geotécnico del terreno — sondeos y ensayos","unit":"pa","unit_price":1800,"active":True},
  {"chapter_code":"20","chapter_name":"Gestion de obra","subcategory":"Proyecto","description":"Levantamiento planimétrico y topográfico de parcela","unit":"pa","unit_price":950,"active":True},
  {"chapter_code":"20","chapter_name":"Gestion de obra","subcategory":"Proyecto","description":"Proyecto de reforma parcial con dirección de obra — honorarios","unit":"pa","unit_price":1800,"active":True},
  {"chapter_code":"20","chapter_name":"Gestion de obra","subcategory":"Proyecto","description":"Certificado de fin de obra y licencia de primera ocupación","unit":"pa","unit_price":680,"active":True},
  {"chapter_code":"20","chapter_name":"Gestion de obra","subcategory":"Proyecto","description":"Estudio de seguridad y salud para obra menor — vivienda","unit":"pa","unit_price":480,"active":True},
  {"chapter_code":"20","chapter_name":"Gestion de obra","subcategory":"Proyecto","description":"Renderizado 3D fotorealista del proyecto — por estancia","unit":"ud","unit_price":380,"active":True},

  # ─── 24 URBANIZACIÓN ─────────────────────────────────────────────────────────
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Piscina","description":"Jacuzzi exterior de fibra de vidrio 4 plazas instalado","unit":"ud","unit_price":8500,"active":True},
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Piscina","description":"Bomba de calor para piscina 10kW instalada — alargamiento temporada","unit":"ud","unit_price":3800,"active":True},
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Piscina","description":"Robot limpiafondos automático para piscina con cable","unit":"ud","unit_price":750,"active":True},
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Jardineria","description":"Diseño y ejecución de jardín mediterráneo bajo consumo — por m²","unit":"m2","unit_price":38,"active":True},
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Jardineria","description":"Plantación de árbol de jardín hasta Ø10cm — incluyendo hoyo y abonado","unit":"ud","unit_price":280,"active":True},
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Jardineria","description":"Seto perimetral con thuja o ligustrum 1,5m — por ml plantado","unit":"ml","unit_price":22,"active":True},
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Pavimentos","description":"Pavimento exterior de losa de hormigón in-situ con juntas de madera","unit":"m2","unit_price":58,"active":True},
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Pavimentos","description":"Pavimento de tarima compuesta (WPC) con estructura aluminio","unit":"m2","unit_price":95,"active":True},
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Muros","description":"Bancada de fábrica de ladrillo revestida con piedra natural exterior","unit":"ml","unit_price":280,"active":True},
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Iluminacion exterior","description":"Instalación de iluminación de jardín — 6 puntos con cableado exterior IP67","unit":"pa","unit_price":1200,"active":True},
  {"chapter_code":"24","chapter_name":"Urbanizacion y exteriores","subcategory":"Varios","description":"Vado permanente de acceso a garaje — pavimento y señalización","unit":"ud","unit_price":850,"active":True},

  # ─── 25 VARIOS ───────────────────────────────────────────────────────────────
  {"chapter_code":"25","chapter_name":"Varios","subcategory":"Documentacion","description":"Proyecto de legalización de ampliación de vivienda — honorarios","unit":"pa","unit_price":2800,"active":True},
  {"chapter_code":"25","chapter_name":"Varios","subcategory":"Documentacion","description":"Certificado energético con propuestas de mejora — emisión y registro","unit":"ud","unit_price":320,"active":True},
  {"chapter_code":"25","chapter_name":"Varios","subcategory":"Documentacion","description":"Auditoria energética residencial completa — visita + informe","unit":"pa","unit_price":680,"active":True},
  {"chapter_code":"25","chapter_name":"Varios","subcategory":"Documentacion","description":"Inspección técnica de edificio IEE — informe completo","unit":"pa","unit_price":1200,"active":True},
  {"chapter_code":"25","chapter_name":"Varios","subcategory":"Garantias","description":"Seguro decenal de edificación — prima única por m2 construido","unit":"m2","unit_price":28,"active":True},
  {"chapter_code":"25","chapter_name":"Varios","subcategory":"Garantias","description":"Seguro de responsabilidad civil de obra — prima anual","unit":"pa","unit_price":480,"active":True},
]

def insert_batch(items):
    data = json.dumps(items).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/quote_items_catalog",
        data=data,
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, "OK"
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

BATCH = 50
total = 0
for i in range(0, len(ITEMS), BATCH):
    batch = ITEMS[i:i+BATCH]
    status, msg = insert_batch(batch)
    if status in (200, 201):
        total += len(batch)
        print(f"  ✓ Batch {i//BATCH+1}: {len(batch)} items ({status})")
    else:
        print(f"  ✗ Batch {i//BATCH+1}: {status} — {msg[:200]}")
    time.sleep(0.3)

print(f"\nTotal inserted: {total} / {len(ITEMS)}")
