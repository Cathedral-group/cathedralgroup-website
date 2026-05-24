-- Rendimientos reales de mano de obra (horas/unidad) por subcategoría.
-- Sustituye el valor uniforme por capítulo (irreal: aplicaba 0.40 igual a m² que a ud)
-- por valores fundados en CYPE Generador de Precios / IVE / BEDEC / PREOC.
-- horas_por_unidad = suma MO (oficial 1ª + peón) por unidad terminada.
-- Las partidas tipo "pa" (instalaciones completas, licencias, medios auxiliares)
-- se dejan en NULL: no tienen rendimiento por unidad que alimente el Gantt.

UPDATE quote_items_catalog SET horas_por_unidad = CASE
  -- 01 Demoliciones
  WHEN chapter_code='01' AND subcategory='Apertura y modificación de huecos' THEN 4.0
  WHEN chapter_code='01' AND subcategory='Carpintería y cerramientos' THEN 0.45
  WHEN chapter_code='01' AND subcategory='Cubiertas' THEN 0.55
  WHEN chapter_code='01' AND subcategory LIKE 'Demolici%n de edificio%' THEN 0.40
  WHEN chapter_code='01' AND subcategory='Demolicion parcial' THEN 0.40
  WHEN chapter_code='01' AND subcategory='Escaleras y barandillas' THEN 0.50
  WHEN chapter_code='01' AND subcategory='Estructuras horizontales y forjados' THEN 1.10
  WHEN chapter_code='01' AND subcategory LIKE 'Gesti%n de residuos%' THEN 0.60
  WHEN chapter_code='01' AND subcategory='Gestion residuos' THEN 0.60
  WHEN chapter_code='01' AND subcategory='Muros y estructuras verticales' THEN 0.90
  WHEN chapter_code='01' AND subcategory='Pavimentos y soleras' THEN 0.35
  WHEN chapter_code='01' AND subcategory='Revestimientos verticales' THEN 0.30
  WHEN chapter_code='01' AND subcategory='Tabiques y particiones' THEN 0.30
  WHEN chapter_code='01' AND subcategory='Techos y falsos techos' THEN 0.20
  -- 02 Tabiquería / trasdosados
  WHEN chapter_code='02' AND subcategory='Aislamiento' THEN 0.12
  WHEN chapter_code='02' AND subcategory='Bloque' THEN 0.55
  WHEN chapter_code='02' AND subcategory='Doble piel' THEN 0.40
  WHEN chapter_code='02' AND subcategory LIKE 'Hormig%n celular' THEN 0.45
  WHEN chapter_code='02' AND subcategory='Instalaciones' THEN 0.40
  WHEN chapter_code='02' AND subcategory='Ladrillo' THEN 0.60
  WHEN chapter_code='02' AND subcategory='Pladur' THEN 0.55
  WHEN chapter_code='02' AND subcategory='Reparacion' THEN 0.40
  WHEN chapter_code='02' AND subcategory LIKE 'Trasdosado%' THEN 0.40
  WHEN chapter_code='02' AND subcategory='Vidrio' THEN 0.40
  -- 03 Solados / pavimentos
  WHEN chapter_code='03' AND subcategory='Exterior' THEN 0.50
  WHEN chapter_code='03' AND subcategory='Madera' THEN 0.35
  WHEN chapter_code='03' AND subcategory='Mármol' THEN 0.70
  WHEN chapter_code='03' AND subcategory='Microcemento' THEN 0.90
  WHEN chapter_code='03' AND subcategory='Parquet' THEN 0.35
  WHEN chapter_code='03' AND subcategory='Piedra natural' THEN 0.75
  WHEN chapter_code='03' AND subcategory LIKE 'Porcel%nico' THEN 0.45
  WHEN chapter_code='03' AND subcategory LIKE 'Preparaci%n' THEN 0.18
  WHEN chapter_code='03' AND subcategory='Preparacion' THEN 0.18
  WHEN chapter_code='03' AND subcategory='Rodapiés' THEN 0.12
  -- 04 Revestimientos verticales (pared)
  WHEN chapter_code='04' AND subcategory='Enfoscado' THEN 0.35
  WHEN chapter_code='04' AND subcategory='Estuco' THEN 0.55
  WHEN chapter_code='04' AND subcategory='Ladrillo visto' THEN 0.70
  WHEN chapter_code='04' AND subcategory='Madera' THEN 0.60
  WHEN chapter_code='04' AND subcategory='Mármol' THEN 0.80
  WHEN chapter_code='04' AND subcategory='Microcemento' THEN 0.85
  WHEN chapter_code='04' AND subcategory='Paneles' THEN 0.45
  WHEN chapter_code='04' AND subcategory='Papel pintado' THEN 0.20
  WHEN chapter_code='04' AND subcategory='Piedra natural' THEN 0.90
  WHEN chapter_code='04' AND subcategory LIKE 'Porcel%nico' THEN 0.80
  WHEN chapter_code='04' AND subcategory='Vinílico' THEN 0.30
  WHEN chapter_code='04' AND subcategory='Yeso' THEN 0.30
  -- 05 Falsos techos
  WHEN chapter_code='05' AND subcategory='Acústico' THEN 0.55
  WHEN chapter_code='05' AND subcategory='Aislamiento' THEN 0.12
  WHEN chapter_code='05' AND subcategory='Continuo' THEN 0.55
  WHEN chapter_code='05' AND subcategory='Decoracion' THEN 0.20
  WHEN chapter_code='05' AND subcategory='Escayola' THEN 0.45
  WHEN chapter_code='05' AND subcategory='Especial' THEN 0.60
  WHEN chapter_code='05' AND subcategory='Iluminación' THEN 0.30
  WHEN chapter_code='05' AND subcategory='Madera' THEN 0.60
  WHEN chapter_code='05' AND subcategory='Pladur' THEN 0.30
  WHEN chapter_code='05' AND subcategory='Registrable' THEN 0.40
  -- 06 Carpintería interior
  WHEN chapter_code='06' AND subcategory='Armarios' THEN 1.0
  WHEN chapter_code='06' AND subcategory='Barandillas' THEN 1.0
  WHEN chapter_code='06' AND subcategory='Escaleras' THEN 3.5
  WHEN chapter_code='06' AND subcategory='Herrajes' THEN 0.30
  WHEN chapter_code='06' AND subcategory='Muebles' THEN 1.0
  WHEN chapter_code='06' AND subcategory='Puertas' THEN 2.5
  WHEN chapter_code='06' AND subcategory='Puertas correderas' THEN 3.5
  WHEN chapter_code='06' AND subcategory='Puertas lacadas' THEN 2.8
  WHEN chapter_code='06' AND subcategory='Puertas madera' THEN 2.5
  WHEN chapter_code='06' AND subcategory='Vestidor' THEN 1.2
  -- 07 Carpintería exterior
  WHEN chapter_code='07' AND subcategory='Aluminio RPT' THEN 2.5
  WHEN chapter_code='07' AND subcategory='Madera' THEN 2.8
  WHEN chapter_code='07' AND subcategory='Protecciones' THEN 0.50
  WHEN chapter_code='07' AND subcategory='PVC' THEN 2.3
  WHEN chapter_code='07' AND subcategory='Seguridad' THEN 2.5
  WHEN chapter_code='07' AND subcategory='Vidrio' THEN 0.40
  -- 08 Electricidad
  WHEN chapter_code='08' AND subcategory='Cargador' THEN 4.0
  WHEN chapter_code='08' AND subcategory='Cuadro' THEN 4.0
  WHEN chapter_code='08' AND subcategory='Domotica' THEN 1.0
  WHEN chapter_code='08' AND subcategory='Mecanismos' THEN 0.20
  WHEN chapter_code='08' AND subcategory='Puntos' THEN 0.90
  WHEN chapter_code='08' AND subcategory='Seguridad' THEN 0.90
  WHEN chapter_code='08' AND subcategory='Solar' THEN 4.0
  WHEN chapter_code='08' AND subcategory='Telecomunicaciones' THEN 0.90
  -- 09 Fontanería / saneamiento
  WHEN chapter_code='09' AND subcategory='ACS' THEN 2.5
  WHEN chapter_code='09' AND subcategory='Aparatos' THEN 1.7
  WHEN chapter_code='09' AND subcategory='Desague' THEN 0.20
  WHEN chapter_code='09' AND subcategory='Griferia' THEN 0.70
  WHEN chapter_code='09' AND subcategory='Presion' THEN 2.5
  WHEN chapter_code='09' AND subcategory='Puntos suministro' THEN 1.2
  WHEN chapter_code='09' AND subcategory='Saneamiento' THEN 0.30
  WHEN chapter_code='09' AND subcategory='Tratamiento' THEN 2.5
  WHEN chapter_code='09' AND subcategory LIKE 'Tuber%a%' THEN 0.18
  WHEN chapter_code='09' AND subcategory='Valvuleria' THEN 0.70
  -- 10 Climatización
  WHEN chapter_code='10' AND subcategory='Accesorios' THEN 0.30
  WHEN chapter_code='10' AND subcategory='Aerotermia' THEN 8.0
  WHEN chapter_code='10' AND subcategory='Aire acondicionado' THEN 3.5
  WHEN chapter_code='10' AND subcategory='Caldera' THEN 4.5
  WHEN chapter_code='10' AND subcategory='Fancoil' THEN 2.5
  WHEN chapter_code='10' AND subcategory='Multi-split' THEN 7.0
  WHEN chapter_code='10' AND subcategory='Radiadores' THEN 1.8
  WHEN chapter_code='10' AND subcategory='Split' THEN 3.5
  WHEN chapter_code='10' AND subcategory='Suelo radiante' THEN 0.50
  WHEN chapter_code='10' AND subcategory='VRV/VRF' THEN 4.0
  -- 11 Pintura
  WHEN chapter_code='11' AND subcategory='Cal' THEN 0.18
  WHEN chapter_code='11' AND subcategory LIKE 'Esmalte%' THEN 0.30
  WHEN chapter_code='11' AND subcategory='Especial' THEN 0.30
  WHEN chapter_code='11' AND subcategory='Exterior' THEN 0.25
  WHEN chapter_code='11' AND subcategory='Interior' THEN 0.18
  WHEN chapter_code='11' AND subcategory='Lacado' THEN 0.35
  WHEN chapter_code='11' AND subcategory='Papel pintado' THEN 0.30
  WHEN chapter_code='11' AND subcategory='Paredes' THEN 0.18
  WHEN chapter_code='11' AND subcategory='Preparacion' THEN 0.30
  WHEN chapter_code='11' AND subcategory='Techo' THEN 0.22
  WHEN chapter_code='11' AND subcategory='Textura' THEN 0.55
  WHEN chapter_code='11' AND subcategory='Tratamientos' THEN 0.30
  -- 12 Cocina
  WHEN chapter_code='12' AND subcategory='Accesorios' THEN 0.30
  WHEN chapter_code='12' AND subcategory='Electrodomesticos' THEN 0.75
  WHEN chapter_code='12' AND subcategory LIKE 'Encimera%' THEN 1.30
  WHEN chapter_code='12' AND subcategory='Fontanería' THEN 1.0
  WHEN chapter_code='12' AND subcategory='Fregadero' THEN 1.0
  WHEN chapter_code='12' AND subcategory='Instalación' THEN 1.2
  WHEN chapter_code='12' AND subcategory='Mobiliario' THEN 1.2
  WHEN chapter_code='12' AND subcategory LIKE 'Muebles%' THEN 1.2
  WHEN chapter_code='12' AND subcategory='Ventilación' THEN 0.75
  -- 13 Baño
  WHEN chapter_code='13' AND subcategory='Accesorios' THEN 0.30
  WHEN chapter_code='13' AND subcategory='Bañera' THEN 3.0
  WHEN chapter_code='13' AND subcategory='Ducha' THEN 2.0
  WHEN chapter_code='13' AND subcategory LIKE 'Grifer%a%' THEN 0.80
  WHEN chapter_code='13' AND subcategory='Lavabo' THEN 1.3
  WHEN chapter_code='13' AND subcategory LIKE 'Mampara%' THEN 1.5
  WHEN chapter_code='13' AND subcategory='Mobiliario' THEN 1.5
  WHEN chapter_code='13' AND subcategory LIKE 'Mueble%' THEN 1.5
  WHEN chapter_code='13' AND subcategory='Plato ducha' THEN 2.0
  WHEN chapter_code='13' AND subcategory='Sanitarios' THEN 1.5
  WHEN chapter_code='13' AND subcategory='Ventilación' THEN 0.75
  -- 15 Cubiertas
  WHEN chapter_code='15' AND subcategory='Canalones' THEN 0.50
  WHEN chapter_code='15' AND subcategory='Cubierta inclinada' THEN 0.70
  WHEN chapter_code='15' AND subcategory='Cubierta plana' THEN 0.45
  WHEN chapter_code='15' AND subcategory='Sótano' THEN 0.45
  WHEN chapter_code='15' AND subcategory='Terraza' THEN 0.45
  -- 16 Estructura
  WHEN chapter_code='16' AND subcategory='Apuntalamiento' THEN 0.80
  WHEN chapter_code='16' AND subcategory='Cimentación' THEN 1.20
  WHEN chapter_code='16' AND subcategory='Dintel' THEN 1.50
  WHEN chapter_code='16' AND subcategory='Escalera' THEN 1.50
  WHEN chapter_code='16' AND subcategory='Hormigón' THEN 1.20
  WHEN chapter_code='16' AND subcategory='Pilares' THEN 1.80
  WHEN chapter_code='16' AND subcategory='Viga metálica' THEN 1.50
  -- 17 Cerrajería
  WHEN chapter_code='17' AND subcategory='Barandillas' THEN 1.20
  WHEN chapter_code='17' AND subcategory='Escalera' THEN 3.50
  WHEN chapter_code='17' AND subcategory='Especial' THEN 0.80
  WHEN chapter_code='17' AND subcategory='Lucernario' THEN 0.80
  WHEN chapter_code='17' AND subcategory='Mampara' THEN 0.80
  WHEN chapter_code='17' AND subcategory='Puertas' THEN 2.50
  WHEN chapter_code='17' AND subcategory='Puertas metálicas' THEN 2.50
  WHEN chapter_code='17' AND subcategory='Rejas' THEN 0.80
  -- 18 Iluminación
  WHEN chapter_code='18' AND subcategory='Carril' THEN 0.50
  WHEN chapter_code='18' AND subcategory='Control' THEN 0.40
  WHEN chapter_code='18' AND subcategory='Emergencia' THEN 0.40
  WHEN chapter_code='18' AND subcategory='Empotrable' THEN 0.40
  WHEN chapter_code='18' AND subcategory='Exterior' THEN 0.60
  WHEN chapter_code='18' AND subcategory='Superficie' THEN 0.40
  WHEN chapter_code='18' AND subcategory='Tira LED' THEN 0.25
  -- 19 Calefacción / instalaciones especiales
  WHEN chapter_code='19' AND subcategory='ACS' THEN 2.50
  WHEN chapter_code='19' AND subcategory='Caldera' THEN 4.50
  WHEN chapter_code='19' AND subcategory='Calefaccion' THEN 1.80
  WHEN chapter_code='19' AND subcategory='Encimera' THEN 1.80
  WHEN chapter_code='19' AND subcategory='Instalacion' THEN 2.50
  -- 23 Fachadas
  WHEN chapter_code='23' AND subcategory='Ladrillo' THEN 1.20
  WHEN chapter_code='23' AND subcategory='Madera' THEN 1.50
  WHEN chapter_code='23' AND subcategory='Mortero' THEN 0.45
  WHEN chapter_code='23' AND subcategory='Piedra' THEN 1.20
  WHEN chapter_code='23' AND subcategory='SATE' THEN 0.90
  WHEN chapter_code='23' AND subcategory='Ventilada' THEN 1.50
  WHEN chapter_code='23' AND subcategory='Zinc' THEN 1.40
  -- 24 Exteriores / urbanización
  WHEN chapter_code='24' AND subcategory='Cerramiento' THEN 0.80
  WHEN chapter_code='24' AND subcategory LIKE 'Jardiner%a' THEN 0.30
  WHEN chapter_code='24' AND subcategory='Muros' THEN 1.50
  WHEN chapter_code='24' AND subcategory='Pavimentos' THEN 0.70
  WHEN chapter_code='24' AND subcategory='Varios' THEN 0.58
  ELSE horas_por_unidad
END
WHERE active;
