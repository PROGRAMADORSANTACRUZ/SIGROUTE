// Script único: siembra los 15 Puntos de Venta y los clientes/destinos históricos
// del módulo Run Errands (SIGLOG-ANTIGUO) en las tablas nuevas de rutas_web.
// Uso: npx tsx scripts/seed-errands-legacy.ts   (desde rutas_web/backend)
import { prismaPlan as prisma } from "../src/lib/prisma";

const PUNTOS_VENTA = [
  "Carnes Santacruz La 93",
  "Carnes Santacruz La 70",
  "Carnes Santacruz La 43",
  "Carnes Santacruz Alameda I",
  "Carnes Santacruz Alameda II",
  "Carnes Santacruz Olaya",
  "Carnes Santacruz San Felipe",
  "Carnes Santacruz Centro",
  "Carnes Santacruz Simon Bolivar",
  "Carnes Santacruz La Granja",
  "Carnes Santacruz Concord",
  "Carnes Santacruz Malambo",
  "Carnes Santacruz Cartagena",
  "Carnes Santacruz Bucaramanga",
  "Carnes Santacruz Pereira",
];

// Columnas originales: Código (legacy, se descarta) | Destino | Dirección | Barrio | Ciudad | Región
const CLIENTES_TSV = `
Run12301	Run Errands - PDV La 93	Calle 93 # 43-166	La Campiña	Barranquilla	Atlantico
Run12302	Run Errands - PDV La 70	Calle 70 # 48-70	El Prado	Barranquilla	Atlantico
Run12303	Run Errands - PDV La 43	Carrera 43 # 74-60	Betania	Barranquilla	Atlantico
Run12304	Run Errands - PDV Alameda I	Calle 114 # 42C-33	Alameda del Rio	Barranquilla	Atlantico
Run12305	Run Errands - PDV Alameda II	Calle 118 # 42B-185	Alameda del Rio	Barranquilla	Atlantico
Run12306	Run Errands - PDV Olaya	Calle 71 # 31-06	Olaya	Barranquilla	Atlantico
Run12307	Run Errands - PDV San Felipe	Calle 64 # 26D-25	San Felipe	Barranquilla	Atlantico
Run12308	Run Errands - PDV Centro	Calle 38 # 36-29	Centro	Barranquilla	Atlantico
Run12309	Run Errands - PDV Simon Bolivar	Calle 19 # 7-31	Simon Bolivar	Barranquilla	Atlantico
Run12310	Run Errands - PDV La Granja	Carrera 19 # 20-30	San Antonio	Soledad	Atlantico
Run12311	Run Errands - PDV Concord	Carrera 27 # 11-79	El Concord	Malambo	Atlantico
Run12312	Run Errands - PDV Malambo	Calle 5 Kilómetro 3	Malambo	Malambo	Atlantico
Run12313	Run Errands - Granero el 9Cito de la 64	Calle 64 # 26-130	Nueva Granada	Barranquilla	Atlantico
Run12314	Run Errands - Insumos y Equipos 64	Calle 64 # 26D-25	San Felipe	Barranquilla	Atlantico
Run12315	Run Errands - Banco Bogota 46	Carrera 46 # 90-17	Villa del Mar	Barranquilla	Atlantico
Run12316	Run Errands - Corresponsal Bancario 46	Carrera 46 # 92-48	Altamira	Barranquilla	Atlantico
Run12317	Run Errands - Edificio Dinamarca	Calle 94 # 58-40	Ciudad Jardin	Barranquilla	Atlantico
Run12318	Run Errands - Kikos Willys 93	Calle 93 # 49C-105	El Poblado	Barranquilla	Atlantico
Run12319	Run Errands - Ferreteria 1A	Carrera 49C # 92-72	El Poblado	Barranquilla	Atlantico
Run12320	Run Errands - Tiendas D1 Calle 93	Calle 93 # 49C-46	El Poblado	Barranquilla	Atlantico
Run12321	Run Errands - Olimpica 93	Calle 93 # 45B-66	Villa del Mar	Barranquilla	Atlantico
Run12322	Run Errands - Olimpica 98	Carrera 54 # 98-05	Altos de Riomar	Barranquilla	Atlantico
Run12323	Run Errands - Tauro Papeleria 94	Carrera 51B # 94-205	Altos del Limon	Barranquilla	Atlantico
Run12324	Run Errands - Tecnas Barranquilla	Carrera 47 # 72-88	El Porvenir	Barranquilla	Atlantico
Run12325	Run Errands - Horeca 1	Carrera 60 # 75-175	La Concepcion	Barranquilla	Atlantico
Run12326	Run Errands - Horeca 2	Calle 92 # 46-09	El Tabor	Barranquilla	Atlantico
Run12327	Run Errands - Comercializar	Calle 72 # 41B-29	Betania	Barranquilla	Atlantico
Run12328	Run Errands - Ara Calle 70	Calle 70 # 47-36	Las Delicias	Barranquilla	Atlantico
Run12329	Run Errands - Makro 76	Carrera 59 # 76-36	Villa Country	Barranquilla	Atlantico
Run12330	Run Errands - Desayunos	Carrera 44B # 96-67	El Poblado	Barranquilla	Atlantico
Run12331	Run Errands - Cambio Pedido	Calle 54 # 63-04	Modelo	Barranquilla	Atlantico
Run12332	Run Errands - Corresponsal Bancario 53	Carrera 53 # 68-248	El Prado	Barranquilla	Atlantico
Run12333	Run Errands - Cambio Pedido La 93	Calle 96 # 42C-29	El Prado	Barranquilla	Atlantico
Run12334	Run Errands - Tauro Papeleria 72	Carrera 52 # 72-46	Bellavista	Barranquilla	Atlantico
Run12335	Run Errands - Fuller 53	Carrera 53 # 76-41	Alto Prado	Barranquilla	Atlantico
Run12336	Run Errands - Mivervine y Karman CIA S.A.S.	Carrera 43 # 61-25	El Recreo	Barranquilla	Atlantico
Run12337	Run Errands - Olimpica Tanganazo	Carrera 60 # 72-05	San Francisco	Barranquilla	Atlantico
Run12338	Run Errands - Banco Bogota 54	Calle 75 # 54-22	El Prado	Barranquilla	Atlantico
Run12339	Run Errands - Nicolas Rodriguez	Calle 81 # 64-29	Paraiso	Barranquilla	Atlantico
Run12340	Run Errands - Josue Moncada	Calle 72 # 68-59	La Concepcion	Barranquilla	Atlantico
Run12341	Run Errands - Kikos Willys 38	Carrera 38 # 69D-91	Las Delicias	Barranquilla	Atlantico
Run12342	Run Errands - Imprecomercial	Calle 72 # 47-69	Bellavista	Barranquilla	Atlantico
Run12343	Run Errands - Cristian Castro	Carrera 49C # 80-38	Ciudad Jardin	Barranquilla	Atlantico
Run12344	Run Errands - Av Villas 72	Calle 72 # 43-97	El Prado	Barranquilla	Atlantico
Run12345	Run Errands - Fabiola Jimenez	Carrera 42H # 84-33	Los Alpes	Barranquilla	Atlantico
Run12346	Run Errands - Gigante del Hogar 43	Carrera 43 # 82-178	La Campiña	Barranquilla	Atlantico
Run12347	Run Errands - Bello y Florez	Calle 72 # 38B-41	Las Delicias	Barranquilla	Atlantico
Run12348	Run Errands - Devolucion La 93	Carrera 50 # 80-273	Alto Prado	Barranquilla	Atlantico
Run12349	Run Errands - Parque Central	Carrera 43 # 50-12	El Rosario	Barranquilla	Atlantico
Run12350	Run Errands - Caribe Verde	Carrera 9G # 110-187	Caribe Verde	Barranquilla	Atlantico
Run12351	Run Errands - Delia Monsalve	Calle 73 # 27-12	Silencio	Barranquilla	Atlantico
Run12352	Run Errands - Disatel	Carrera 43 # 51-02	Boston	Barranquilla	Atlantico
Run12353	Run Errands - Recogida de Llaves	Carrera 18 # 47-30	El Carmen	Barranquilla	Atlantico
Run12354	Run Errands - Gomru Inversiones	Calle 46 # 53-51	Centro	Barranquilla	Atlantico
Run12355	Run Errands - Milena Acero	Calle 96 # 59B-47	Altos de Riomar	Barranquilla	Atlantico
Run12356	Run Errands - Boletas	Calle 89 # 53-12	Riomar	Barranquilla	Atlantico
Run12357	Run Errands - Karol Serrano	Calle 84 # 55-30	Riomar	Barranquilla	Atlantico
Run12358	Run Errands - Gilberto Serrano	Calle 60 # 37-57	Villas del Recreo	Barranquilla	Atlantico
Run12359	Run Errands - Inversiones Paster	Calle 56 # 46-44	Boston	Barranquilla	Atlantico
Run12360	Run Errands - Cristaleria Selman	Calle 70 # 45-19	Las Delicias	Barranquilla	Atlantico
Run12361	Run Errands - Ani Restrepo	Carrera 30 # 47B-37	Loma Fresca	Barranquilla	Atlantico
Run12362	Run Errands - Ara Carrera 50	Carrera 50 # 61-120	El Prado	Barranquilla	Atlantico
Run12363	Run Errands - Drogueria Botica 84	Calle 84 # 51B-46	San Vicente	Barranquilla	Atlantico
Run12364	Run Errands - Tiendas D1 Calle 71	Calle 71 # 32-108	Olaya	Barranquilla	Atlantico
Run12365	Run Errands - MultiDesechables	Calle 72 # 41-78	Las Delicias	Barranquilla	Atlantico
Run12366	Run Errands - Nestor Barrios	Carrera 42B # 114-31	Alameda del Rio	Barranquilla	Atlantico
Run12367	Run Errands - Claireht Sencial	Transversal 44 # 102-72	Miramar	Barranquilla	Atlantico
Run12368	Run Errands - Dally Viñas	Carrera 65 # 99-109	La Castellana	Barranquilla	Atlantico
Run12369	Run Errands - Supergiros Calle 72	Calle 72 # 38-25	Las Delicias	Barranquilla	Atlantico
Run12370	Run Errands - Gastrobar	Carrera 27 # 83C-20	Villas de la Colina	Barranquilla	Atlantico
Run12371	Run Errands - Ferrelectricos Olaya	Calle 70B # 30-36	Olaya	Barranquilla	Atlantico
Run12372	Run Errands - Corresponsal Bancario Alameda	Calle 114 # 42C-33	Alameda del Rio	Barranquilla	Atlantico
Run12373	Run Errands - Karen Ramirez	Carrera 42B # 114-31	Alameda del Rio	Barranquilla	Atlantico
Run12374	Run Errands - Ferreteria 3 en 1	Calle 93 # 49C-10	El Poblado	Barranquilla	Atlantico
Run12375	Run Errands - Calypso Calle 41	Calle 41 # 52-08	Barrio Abajo	Barranquilla	Atlantico
Run12376	Run Errands - Nini Rios	Carrera 49C # 99-106	Alto Prado	Barranquilla	Atlantico
Run12377	Run Errands - Shirlys Ortega	Calle 49 # 66-43	San Francisco	Barranquilla	Atlantico
Run12378	Run Errands - Yummy Ahumados	Carrera 43C # 112-20	Alameda del Rio	Barranquilla	Atlantico
Run12379	Run Errands - La Urbana	Calle 88 # 73A-10	Villa Carolina	Barranquilla	Atlantico
Run12380	Run Errands - Petromil 51B	Carrera 51B # 92-01	Altos del Limon	Barranquilla	Atlantico
Run12381	Run Errands - Efecty Alameda	Calle 114 # 42C-33	Alameda del Rio	Barranquilla	Atlantico
Run12382	Run Errands - Insumos y Equipos 47	Calle 47 # 16-72	Cevillar	Barranquilla	Atlantico
Run12383	Run Errands - Corresponsal Bancario 33	Carrera 33 # 51-27	Lucero	Barranquilla	Atlantico
Run12384	Run Errands - Diana Meza	Calle 100 # 42F-100	Miramar	Barranquilla	Atlantico
Run12385	Run Errands - Oceana 52	Carrera 52 # 106-213	Villla Santos	Barranquilla	Atlantico
Run12386	Run Errands - Conjunto Maui	Calle 1D # 21-55	Ciudad Mallorquin	Barranquilla	Atlantico
Run12387	Run Errands - Monica Cervantes	Carrera 52 # 106-213	Villa Santos	Barranquilla	Atlantico
Run12388	Run Errands - Angelica Coronado	Calle 1D # 21-55	Sabanilla	Puerto Colombia	Atlantico
Run12389	Run Errands - María Gonzalez	Carrera 47 # 100-14	Villa Santos	Barranquilla	Atlantico
Run12390	Run Errands - Farmatodo 43	Carrera 43 # 75-02	Betania	Barranquilla	Atlantico
Run12391	Run Errands - Corresponsal Bancario 26	Carrera 26C 7 # 74B-06	El Silencio	Barranquilla	Atlantico
Run12392	Run Errands - Supergiros Calle 34	Diagonal 34 # 69D-65	Las Delicias	Barranquilla	Atlantico
Run12393	Run Errands - CC. Americano	Carrera 38 # 74-179	Las Mercedes	Barranquilla	Atlantico
Run12394	Run Errands - Diego Rodriguez	Calle 84B # 42D-241	Campo Alegre	Barranquilla	Atlantico
Run12395	Run Errands - SAI Grafic	Calle 90 # 46-185	Altamira	Barranquilla	Atlantico
Run12396	Run Errands - Salsamentaria	Calle 26 # 15-14	Las Nieves	Barranquilla	Atlantico
Run12397	Run Errands - Dayan Mendez	Calle 120 # 42-41	Alameda del Rio	Barranquilla	Atlantico
Run12398	Run Errands - Ara Calle 93	Calle 93 # 49C-96	El Poblado	Barranquilla	Atlantico
Run12399	Run Errands - Equipar	Carrera 43 # 55-08	Boston	Barranquilla	Atlantico
Run123100	Run Errands - Finca Rosaleda	Calle Avenida Cayena Real	Sabanilla	Puerto Colombia	Atlantico
Run123101	Run Errands - Conjunto Pelicano	Carrera 42B # 116-121	Alameda del Rio	Barranquilla	Atlantico
Run123102	Run Errands - Torre Antillana	Carrera 44B # 96-67	Miramar	Barranquilla	Atlantico
Run123103	Run Errands - Conjunto Mirla	Calle 120 # 42-112	Alameda del Rio	Barranquilla	Atlantico
Run123104	Run Errands - Grupo Brioca	Calle 80 # 67-54	Paraiso	Barranquilla	Atlantico
Run123105	Run Errands - Insumos JR	Carrera 47 # 46-80	Barrio Abajo	Barranquilla	Atlantico
Run123106	Run Errands - CC. Unico	Calle 74 # 41-38	Betania	Barranquilla	Atlantico
Run123107	Run Errands - Panaderia 20 de Julio	Carrera 43 # 69-184	Las Delicias	Barranquilla	Atlantico
Run123108	Run Errands - Conjunto Tucan	Calle 114 # 42C-330	Alameda del Rio	Barranquilla	Atlantico
Run123109	Run Errands - Panaderia Panotti	Carrera 64 # 84-178	Andalucia	Barranquilla	Atlantico
Run123110	Run Errands - Conjunto Altamar Caribe	Calle 2A # 20-70	Sabanilla	Puerto Colombia	Atlantico
Run123111	Run Errands - Asia Long	Carrera 55 # 99-51	Riomar	Barranquilla	Atlantico
Run123112	Run Errands - Silvia Diaz	Carrera 43B # 98-96	Miramar	Barranquilla	Atlantico
Run123113	Run Errands - Corresponsal Bancario 44	Carrera 44 # 74-25	Bellavista	Barranquilla	Atlantico
Run123114	Run Errands - Olimpica 68	Calle 68 # 32-04	El Recreo	Barranquilla	Atlantico
Run123115	Run Errands - Ferreteria de la 26	Carrera 26D # 24-02	El Silencio	Barranquilla	Atlantico
Run123116	Run Errands - Belkis Montes	Carrera 23 # 47C-43	Alfonso Lopez	Barranquilla	Atlantico
Run123117	Run Errands - Papeleria 21	Carrera 21B # 68-20	San Felipe	Barranquilla	Atlantico
Run123118	Run Errands - Banco Bogota 38	Carrera 38 # 70B-33	Las Delicias	Barranquilla	Atlantico
Run123119	Run Errands - Balcones de Andalucia	Carrera 72 # 88-61	Villa Carolina	Barranquilla	Atlantico
Run123120	Run Errands - Al Barril	Carrera 73 # 88-12	Villa Carolina	Barranquilla	Atlantico
Run123121	Run Errands - Rest. Terraza Arabe	Calle 70 # 58-39	San Francisco	Barranquilla	Atlantico
Run123122	Run Errands - Corresponsal Bancario 27	Carrera 27 # 64-38	Nueva Granada	Barranquilla	Atlantico
Run123123	Run Errands - Granero el 9Cito de la 38	Carrera 38 # 79C-40	Olaya	Barranquilla	Atlantico
Run123124	Run Errands - Edificio Sofia	Calle 91 # 75A-45	Villa Carolina	Barranquilla	Atlantico
Run123125	Run Errands - Olimpica 72	Carrera 47 # 72-31	Bellavista	Barranquilla	Atlantico
Run123126	Run Errands - Variedades Mary	Calle 71 # 62-08	San Francisco	Barranquilla	Atlantico
Run123127	Run Errands - Los Dibujantes 46	Calle 84 # 45-53	Nuevo Horizonte	Barranquilla	Atlantico
Run123128	Run Errands - DollarCity	Carrera 43C # 112-30	Alameda del Rio	Barranquilla	Atlantico
Run123129	Run Errands - El Hueco 46	Carrera 46 # 91-54	Altamira	Barranquilla	Atlantico
Run123130	Run Errands - Corresponsal Bancario 21B	Carrera 21B # 58-38	El Carmen	Barranquilla	Atlantico
Run123131	Run Errands - Lechona Serrano	Carrera 19 # 45-34	El Carmen	Barranquilla	Atlantico
Run123132	Run Errands - Corresponsal Bancario 38	Carrera 38 # 69D-10	Las Delicias	Barranquilla	Atlantico
Run123133	Run Errands - El Hueco 38	Carrera 38 # 70B-55	Las Delicias	Barranquilla	Atlantico
Run123134	Run Errands - Corresponsal Bancario 70B	Calle 70B # 30-14	Olaya	Barranquilla	Atlantico
Run123135	Run Errands - Conjunto Barcelona	Transversal 44 # 99-115	Miramar	Barranquilla	Atlantico
Run123136	Run Errands - Olimpica Alameda	Calle 114 # 42C-33	Alameda del Rio	Barranquilla	Atlantico
Run123137	Run Errands - CC Miramar	Carrera 43 # 99-50	Miramar	Barranquilla	Atlantico
Run123138	Run Errands - Marcela Pisciotti	Calle 98 # 42G-61	Miramar	Barranquilla	Atlantico
Run123139	Run Errands - CI Marysol	Via 40 # 71-197	La Concepcion	Barranquilla	Atlantico
Run123140	Run Errands - Mirador del Mar	Calle 98 # 42G-61	Miramar	Barranquilla	Atlantico
Run123141	Run Errands - Conjunto Turpial	Calle 117 # 42B-25	Alameda del Rio	Barranquilla	Atlantico
Run123142	Run Errands - Edificio Madeira	Carrera 75 # 78-75	La Concepcion	Barranquilla	Atlantico
Run123143	Run Errands - Jhon Gonzalez	Calle 79 # 39-84	Olaya	Barranquilla	Atlantico
Run123144	Run Errands - TalsaMarket	Calle 93 # 46-168	El Poblado	Barranquilla	Atlantico
Run123145	Run Errands - Conjunto Canario	Calle 117 # 42-189	Alameda del Rio	Barranquilla	Atlantico
Run123146	Run Errands - Olimpica 100	Calle 100 # 51B-74	Villa Santos	Barranquilla	Atlantico
Run123147	Run Errands - Edificio Linkai	Calle 1A # 24-86	Sabanilla	Puerto Colombia	Atlantico
Run123148	Run Errands - Edificio Takoa	Calle 2A # 20-70	Sabanilla	Puerto Colombia	Atlantico
Run123149	Run Errands - Conjunto Torcaza	Calle 112 # 42-19	Alameda del Rio	Barranquilla	Atlantico
Run123150	Run Errands - Restaurante 7 Brasas	Calle 63A # 38-12	Recreo	Barranquilla	Atlantico
Run123151	Run Errands - Urban Food	Calle 53D # 19-06	El Carmen	Barranquilla	Atlantico
Run123152	Run Errands - Hernando Sierra	Calle 96A # 50-43	Altos del Limon	Barranquilla	Atlantico
Run123153	Run Errands - Conjunto Maria Mulata	Calle 118 # 43-46	Alameda del Rio	Barranquilla	Atlantico
Run123154	Run Errands - Conjunto Amazilia	Calle 120 # 42B-112	Alameda del Rio	Barranquilla	Atlantico
Run123155	Run Errands - Conjunto Florencia	Transversal 44 # 104-30	Miramar	Barranquilla	Atlantico
Run123156	Run Errands - Telefonia Claro 53	Carrera 53 # 74-126	Bellavista	Barranquilla	Atlantico
Run123157	Run Errands - Ferreteria Ponquifon	Calle 93 # 42C-37	La Cumbre	Barranquilla	Atlantico
Run123158	Run Errands - Conjunto Tozcana	Transversal 44 # 100-82	Miramar	Barranquilla	Atlantico
Run123159	Run Errands - Ferretemas	Carrera 46 # 95-61	El Poblado	Barranquilla	Atlantico
Run123160	Run Errands - Delipostres	Carrera 27 # 64-01	Nueva Granada	Barranquilla	Atlantico
Run123161	Run Errands - Ferreteria Metropolis Center	Carrera 43 # 82-209	Los Alpes	Barranquilla	Atlantico
Run123162	Run Errands - Ferreteria Orbifer	Carrera 47 # 68-09	El Prado	Barranquilla	Atlantico
Run123163	Run Errands - Tauro Papeleria 43	Carrera 43 # 54-31	Boston	Barranquilla	Atlantico
Run123164	Run Errands - Walter Rodriguez	Carrera 38 # 79B-18	Ciudad Jardin	Barranquilla	Atlantico
Run123165	Run Errands - Isimo Carrera 27	Carrera 27 # 48-02	Loma Fresca	Barranquilla	Atlantico
Run123166	Run Errands - Suprema	Transversal 44 # 100-60	Miramar	Barranquilla	Atlantico
Run123167	Run Errands - Banco BBVA 51B	Carrera 51B # 85-48	San Vicente	Barranquilla	Atlantico
Run123168	Run Errands - Papeleria La Corona	Calle 85 # 65-Esquina	Paraiso	Barranquilla	Atlantico
Run123169	Run Errands - Conjunto Arcoiris	Calle 78 # 57-75	Villa Country	Barranquilla	Atlantico
Run123170	Run Errands - Corresponsal Bancario 71	Calle 71 # 31-59	Olaya	Barranquilla	Atlantico
Run123171	Run Errands - Kikos Willys 21	Calle 64 # 21B-14	Los Andes	Barranquilla	Atlantico
Run123172	Run Errands - Edificio Luccas	Carrera 52 # 82-203	San Vicente	Barranquilla	Atlantico
Run123173	Run Errands - Corresponsal Bancario 21	Carrera 21 # 48-05	El Carmen	Barranquilla	Atlantico
Run123174	Run Errands - Ferreteria Materiales Ferrecor	Calle 70 # 46-80	El Prado	Barranquilla	Atlantico
Run123175	Run Errands - TAG	Carrera 45 # 74-75	Betania	Barranquilla	Atlantico
Run123176	Run Errands - Ara Carrera 38	Carrera 38 # 108-01	Las Estrellas	Barranquilla	Atlantico
Run123177	Run Errands - Corresponsal Bancario 25	Carrera 25B # 65-12	Santo Domingo	Barranquilla	Atlantico
Run123178	Run Errands - Banco Caja Social 53	Carrera 53 # 74-130	Bellavista	Barranquilla	Atlantico
Run123179	Run Errands - María Gutierrez	Calle 60 # 33-12	Lucero	Barranquilla	Atlantico
Run123180	Run Errands - Ferreteria Construcem	Calle 54 # 38-09	Villas del Recreo	Barranquilla	Atlantico
Run123181	Run Errands - Ferreteria Alameda	Calle 114 # 42C-33	Alameda del Rio	Barranquilla	Atlantico
Run123182	Run Errands - Electric Smart	Carrera 43 # 69-90	Las Delicias	Barranquilla	Atlantico
Run123183	Run Errands - Everway Company S.A.S	Calle 50 # 53-55	Montecristo	Barranquilla	Atlantico
Run123184	Run Errands - Soto Baez	Calle 114 # 42C-33	Alameda del Rio	Barranquilla	Atlantico
Run123185	Run Errands - Fabian Martinez	Carrera 40A # 84A-79	Campo Alegre	Barranquilla	Atlantico
Run123186	Run Errands - Celu Accesorios	Calle 72 # 41C-159	Betania	Barranquilla	Atlantico
Run123187	Run Errands - Edificio Sunset	Carrera 49E # 98A-52	Villa Santos	Barranquilla	Atlantico
Run123188	Run Errands - Edificio Sunset Boulevard	Calle 1A # 30-61	Montecarmelo	Barranquilla	Atlantico
Run123189	Run Errands - Corresponsal Bancario 35C	Carrera 35C # 76-10	Delicias	Barranquilla	Atlantico
Run123190	Run Errands - Isimo Calle 71	Calle 71 # 32-09	Olaya	Barranquilla	Atlantico
Run123191	Run Errands - Ferreteria Gruffer	Carrera 13 # 84B-38	La Manga	Barranquilla	Atlantico
Run123192	Run Errands - Conjunto Amore	Carrera 22 # 1E-86	Ciudad Mallorquin	Puerto Colombia	Atlantico
Run123193	Run Errands - Mi Corral	Calle 84 # 66-36	Paraiso	Barranquilla	Atlantico
Run123194	Run Errands - Banco Serfinanza 72	Calle 72 # 54-35	El Prado	Barranquilla	Atlantico
Run123195	Run Errands - Kikos Willys 88	Calle 88 # 74-30	Villa Carolina	Barranquilla	Atlantico
Run123196	Run Errands - Edificio Parque 100	Calle 100 # 42F-100	El Porvenir	Barranquilla	Atlantico
Run123197	Run Errands - Banco de Occidente 52	Carrera 52 # 74-56	El Prado	Barranquilla	Atlantico
Run123198	Run Errands - Damaris Quintana	Carrera 36 # 87-40	Las Estrellas	Barranquilla	Atlantico
Run123199	Run Errands - El Hueco Alameda	Calle 110 # 43C-91	Alameda del Rio	Barranquilla	Atlantico
Run123200	Run Errands - Conjunto Bolonia	Transversal 44 # 100-123	Miramar	Barranquilla	Atlantico
Run123201	Run Errands - Olimpica 21	Carrera 21B # 63B-50	Los Andes	Barranquilla	Atlantico
Run123202	Run Errands - Ariel Marin	Carrera 23 # 68-89	San Felipe	Barranquilla	Atlantico
Run123203	Run Errands - Publimaster	Calle 90 # 46-93	Altamira	Barranquilla	Atlantico
Run123204	Run Errands - Adelia Nuñez	Carrera 47 # 70-10	Boston	Barranquilla	Atlantico
Run123205	Run Errands - Mundial de Tornillos	Calle 30 # 21-76	Los Trupillos	Barranquilla	Atlantico
Run123206	Run Errands - BC Empresarial	Carrera 24 # 1A-24	Montecarmelo	Puerto Colombia	Atlantico
Run123207	Run Errands - Granero el 9Cito de la 8	Carrera 8 # 33A-79	Las Palmas	Barranquilla	Atlantico
Run123208	Run Errands - Ingrid Sanchez	Calle 92 # 46-99	Riomar	Barranquilla	Atlantico
Run123209	Run Errands - Arabe Internacional	Calle 93 # 47-73	Altamira	Barranquilla	Atlantico
Run123210	Run Errands - Corresponsal Bancario 89	Calle 75 # 59-52	Villa Country	Barranquilla	Atlantico
Run123211	Run Errands - Edificio Amsterdam	Carrera 59B # 91-94	Altos de Riomar	Barranquilla	Atlantico
Run123212	Run Errands - Rubiela Millan	Calle 54 # 33-99	El Recreo	Barranquilla	Atlantico
Run123213	Run Errands - Corresponsal Bancario 68B	Calle 68B # 53-125	El Prado	Barranquilla	Atlantico
Run123214	Run Errands - Jair Bolivar	Carrera 51 # 93-12	El Poblado	Barranquilla	Atlantico
Run123215	Run Errands - Basculas Bil SAS	Calle 61 # 37-16	El Recreo	Barranquilla	Atlantico
Run123216	Run Errands - Olimpica 43	Carrera 43 # 80-123	Ciudad Jardin	Barranquilla	Atlantico
Run123217	Run Errands - Granero el 9Cito de la 21B	Carrera 21B # 57-57	El Carmen	Barranquilla	Atlantico
Run123218	Run Errands - Wendy Lopez Cataño	Carrera 52 # 90-223	Riomar	Barranquilla	Atlantico
Run123219	Run Errands - Andrea Carolina Sabino Cardona	Calle 47B # 20-31	El Carmen	Barranquilla	Atlantico
Run123220	Run Errands - Angely Paola Olivo Solano	Calle 22 # 47B-02	Alfonso Lopez	Barranquilla	Atlantico
Run123221	Run Errands - Edificio Horizonte de Miramar	Carrera 43 # 98-106	Miramar	Barranquilla	Atlantico
Run123222	Run Errands - Conjunto Paloma	Calle 117 # 42B-74	Alameda del Rio	Barranquilla	Atlantico
Run123223	Run Errands - Conjunto Stone Creek	Carrera 52 # 94-296	Riomar	Barranquilla	Atlantico
Run123224	Run Errands - El Hueco 64	Calle 64 # 20B-50	Los Andes	Barranquilla	Atlantico
Run123225	Run Errands - Techno	Calle 53 # 50-06	Barrio Abajo	Barranquilla	Atlantico
Run123226	Run Errands - La Economia	Calle 70 # 48-28	El Prado	Barranquilla	Atlantico
Run123227	Run Errands - Olimpica 3A	Calle 3A # 25-203	Sabanilla Montecarmelo	Barranquilla	Atlantico
Run123228	Run Errands - Comfamiliar 48	Calle 48 # 43-56	El Rosario	Barranquilla	Atlantico
Run123229	Run Errands - Super Efectivo	Carrera 21 # 63-Esquina	Los Andes	Barranquilla	Atlantico
Run123230	Run Errands - Mi Kioskito	Carrera 21B # 68-03	San Felipe	Barranquilla	Atlantico
Run123231	Run Errands - SYM	Calle 70 # 47-29	El Prado	Barranquilla	Atlantico
Run123232	Run Errands - Super Espejo	Carrera 46 # 70-17	El Prado	Barranquilla	Atlantico
Run123233	Run Errands - Banco de Bogota 25	Carrera 25 # 64-108	Santo Domingo	Barranquilla	Atlantico
Run123234	Run Errands - Corresponsal Bancario 74	Calle 74 # 38D-113	Betania	Barranquilla	Atlantico
Run123235	Run Errands - DollarCity Viva	Carrera 51B # 90-Esquina	Santa Monica	Barranquilla	Atlantico
Run123236	Run Errands - Banco de Occidente 43	Carrera 43 # 55-06	Boston	Barranquilla	Atlantico
Run123237	Run Errands - Corresponsal Bancario 72	Calle 72 # 45-66	Las Delicias	Barranquilla	Atlantico
Run123238	Run Errands - Combarranquilla	Carrera 43 # 63-39	Boston	Barranquilla	Atlantico
Run123239	Run Errands - El Hueco 49B	Carrera 49B # 75-105	El Prado	Barranquilla	Atlantico
Run123240	Run Errands - Plastigiraldo	Calle 30 # 44-53	Centro	Barranquilla	Atlantico
Run123241	Run Errands - Banco Caja Social 43	Carrera 43 # 72-Esquina	El Porvenir	Barranquilla	Atlantico
Run123242	Run Errands - Rosi Caballero	Calle 96 # 42H-40	Villa del Mar	Barranquilla	Atlantico
Run123243	Run Errands - Davivienda 38	Carrera 38 # 74-179	Las Mercedes	Barranquilla	Atlantico
Run123244	Run Errands - Servientrega Alameda del Rio	Calle 114 # 42C-Esquina	Alameda del Rio	Barranquilla	Atlantico
Run123245	Run Errands - Maxcell	Calle 114 # 42B-Esquina	Alameda del Rio	Barranquilla	Atlantico
Run123246	Run Errands - Conjunto Residencial Calle 96	Carrera 43 # 95A-148	Villa del Mar	Barranquilla	Atlantico
Run123247	Run Errands - Quilla Col	Calle 85 # 51B-20	San Vicente	Barranquilla	Atlantico
Run123248	Run Errands - Conjunto Torino	Calle 102 # Transversal 43-35	Miramar	Barranquilla	Atlantico
Run123249	Run Errands - Banco Colpatria	Carrera 38 # 74-179	Las Mercedes	Barranquilla	Atlantico
Run123250	Run Errands - Edificio Skorpio	Carrera 49C # 99-30	Villa Santos	Barranquilla	Atlantico
Run123251	Run Errands - Cerrajeria Rojas	Carrera 42F # 76-21	Ciudad Jardin	Barranquilla	Atlantico
Run123252	Run Errands - Surtisterio	Calle 76 # 48-15	Ciudad Jardin	Barranquilla	Atlantico
Run123253	Run Errands - Conjunto Aquanova	Carrera 10 # 22-24	Las Palmas	Barranquilla	Atlantico
Run123254	Run Errands - Colegio San Jose	Via 5 # 175-Esquina	Villa Campestre	Puerto Colombia	Atlantico
Run123255	Run Errands - Copias Richard	Calle 76 # 42-120	Betania	Barranquilla	Atlantico
Run123256	Run Errands - Wom	Calle 84 # 66-36	Riomar	Barranquilla	Atlantico
Run123257	Run Errands - Supergiros 69D	Diagonal 69D # 95-125	Evaristo Sourdis	Barranquilla	Atlantico
Run123258	Run Errands - Colpatria 84	Calle 84 # 50-Esquina	Ciudad Jardin	Barranquilla	Atlantico
Run123259	Run Errands - Mister Pan	Carrera 43 # 72-108	Betania	Barranquilla	Atlantico
Run123260	Run Errands - Sugey Rico	Calle 57 # 96-141	Aremay	Barranquilla	Atlantico
Run123261	Run Errands - Fotocopia Jireth	Carrera 43 # 48-21	El Rosario	Barranquilla	Atlantico
Run123262	Run Errands - Ferreteria Master	Carrera 43 # 80-30	Ciudad Jardin	Barranquilla	Atlantico
Run123263	Run Errands - Ferreteria Gallo de Oro	Carrera 43 # 82-91	Ciudad Jardin	Barranquilla	Atlantico
Run123264	Run Errands - Ferreteria JG	Calle 71 # 29-07	Olaya	Barranquilla	Atlantico
Run123265	Run Errands - Telefonia Claro 21	Carrera 21 # 48-28	El Carmen	Barranquilla	Atlantico
Run123266	Run Errands - Dipaca	Calle 43 # 41-38	El Rosario	Barranquilla	Atlantico
Run123267	Run Errands - Allfrio Ingenieros SAS	Carrera 41 # 43-55	El Rosario	Barranquilla	Atlantico
Run123268	Run Errands - El Hueco 72	Calle 72 # 43-36	Las Delicias	Barranquilla	Atlantico
Run123269	Run Errands - El Chuzo del Jefe	Calle 93 # 49C-218	El Poblado	Barranquilla	Atlantico
Run123270	Run Errands - Sabro Perro Olaya	Carrera 32 # 70B-115	Olaya	Barranquilla	Atlantico
Run123271	Run Errands - Interdeportes	Carrera 43 # 43-17	Centro	Barranquilla	Atlantico
Run123272	Run Errands - Liz Meyer	Calle 92 # 42B 1-24	La Cumbre	Barranquilla	Atlantico
Run123273	Run Errands - Edificio Amsterdam	Carrera 59B # 91-94	Altos de Riomar	Barranquilla	Atlantico
Run123274	Run Errands - Jazmin Limas Cantillo	Carrera 26 # 110-18	Los Olivos 2	Barranquilla	Atlantico
Run123275	Run Errands - Conjunto Perdiz	Calle 116 # 42C-80	Alameda del Rio	Barranquilla	Atlantico
Run123276	Run Errands - Ferreteria Isamar	Carrera 62 #70-2	San Francisco	Barranquilla	Atlantico
Run123277	Run Errands - Ferreteria Rueda	Calle 72 # 66-69	El Prado	Barranquilla	Atlantico
Run123278	Run Errands - Materiales La 27	Carrera 27 # 64-56	Santo Domingo	Barranquilla	Atlantico
Run123279	Run Errands - Sabro Perro Las Nieves	Carrera 18 # 26-92	Las Nieves	Barranquilla	Atlantico
Run123280	Run Errands - Todo Suyo	Carrera 49 # 69-35	El Prado	Barranquilla	Atlantico
Run123281	Run Errands - Hotel Puerta del Sol S.A.	Calle 75 # 41D-79	Ciudad Jardin	Barranquilla	Atlantico
Run123282	Run Errands - Edificio Portobelo	Calle 99 # 58-99	Altos de Riomar	Barranquilla	Atlantico
Run123283	Run Errands - Banco de Bogota 47	Calle 47 # 20-31	Prueba	Barranquilla	Atlantico
Run123284	Run Errands - Ecos Monterrey	Carrera 21B # 65C-21	Prueba	Barranquilla	Atlantico
Run123285	Run Errands - Ara Carrera 27	Carrera 27 # 64-03	Prueba	Barranquilla	Atlantico
Run123286	Run Errands - Sites Group S.A.S.	Calle 1A # 24-16	Sabanilla	Puerto Colombia	Atlántico
Run123287	Run Errands - Rio Norte	Calle 110 # 53-1670	Riomar	Barranquilla	Atlántico
Run123288	Run Errands - Davivienda 50	Carrera 50 # 75-175	Alto Prado	Barranquilla	Atlántico
Run123289	Run Errands - Corresponsal Bancario 51	Carrera 51 # 75-121	Alto Prado	Barranquilla	Atlántico
Run123290	Run Errands - Comfamiliar 47	Carrera 47 # 82-15	Ciudad Jardin	Barranquilla	Atlántico
Run123291	Run Errands - Auteco 43	Carrera 43 # 67-57	Las Delicias	Barranquilla	Atlántico
Run123292	Run Errands - Cerrajeria Barranquilla	Calle 79 # 49-32	Alto Prado	Barranquilla	Atlantico
Run123293	Run Errands - Farma Vida	Calle 118 # 43 - Esquina	Alameda del Rio	Barranquilla	Atlantico
Run123294	Run Errands - Inversiones del Rio	Calle 2 # 3-142	Prueba	Puerto Colombia	Atlantico
Run123295	Run Errands - Efecty	Carrera 21B # 61-37	Prueba	Barranquilla	Atlántico
Run123296	Run Errands - Inversiones Pasilla S.A.S.	Calle 48 # 67B-97	Santa Ana	Barranquilla	Atlántico
Run123297	Run Errands - Unimetro	Calle 76 # 42-78	Las Mercedes	Barranquilla	Atlántico
Run123298	Run Errands - Nexus Holding S.A.S	Carrera 51B # 76-115	Alto Prado	Barranquilla	Atlantico
Run123299	Run Errands - Mi Corral 43	Carrera 43 # 82 - 93	Ciudad Jardin	Barranquilla	Atlantico
Run123300	Run Errands - Efecty 27	Carrera 27 # 60-45	Prueba	Barranquilla	Atlántico
Run123301	Run Errands - Loraine Steffanell	Calle 92 # 42E-44	Miramar	Barranquilla	Atlántico
Run123302	Run Errands - Olimpica 53	Carrera 53 # 82-77	Alto Prado	Barranquilla	Atlantico
Run123303	Run Errands - CC. Meridiem Golf	Carrera 59B # 81-158	Golf	Barranquilla	Atlantico
Run123304	Run Errands - Angely Olivo Solano	Calle 47C # 22-45	Alfonso Lopez	Barranquilla	Atlantico
Run123305	Run Errands - Zoraya Valentino	Carrera 52C # 94-17	Riomar	Barranquilla	Atlantico
Run123306	Run Errands - Ferreteria el Pradito	Calle 52 # 62-6	Prueba	Barranquilla	Atlantico
Run123307	Run Errands - Av Villas 93	Calle 93 # 45B-38	Riomar	Barranquilla	Atlantico
Run123308	Run Errands - Distribuidora de Rrefrigeracion	Carrera 44 # 68-Esquina	Las Delicias	Barranquilla	Atlantico
Run123309	Run Errands - Conjunto Gorrion	Carrera 41G # 113-125	Alameda del Rio	Barranquilla	Atlantico
Run123310	Run Errands - Efecty 21	Carrera 21 # 48-28	Prueba	Barranquilla	Atlantico
Run123311	Run Errands - Servientrega 46	Carrera 45B # 92-90	La Campiña	Barranquilla	Atlantico
Run123312	Run Errands - Conjunto Flamingo	Carrera 43b # 114 - 80	Alameda del Rio	Barranquilla	Atlantico
Run123313	Run Errands - Conjunto Colibrí	Calle 112 #43-185	Alameda del Rio	Barranquilla	Atlantico
Run123314	Run Errands - Banco Davivienda 72	Calle 54 # 70 - 189	El Prado	Barranquilla	Atlantico
Run123315	Run Errands - Mercadito Boston	Calle 59 #43 - 89	Recreo	Barranquilla	Atlantico
Run123316	Run Errands - Movil Max	Calle 114 # 42C-33	Alameda del Rio	Barranquilla	Atlantico
Run123317	Run Errands - Centro Comercial Jardín del Río	Calle 114 # 42C - 33	Alameda del Rio	Barranquilla	Atlantico
Run123318	Run Errands - Ruben Cueto	Carrera 33 # 43-03	Chiquinquira	Barranquilla	Atlantico
Run123319	Run Errands - Adriana Aguilar	Carrera 23B # 75A-06	Nueva Colombia	Barranquilla	Atlantico
Run123320	Run Errands - Olimpica 27	Carrera 27 # 106-14	Los Olivos	Barranquilla	Atlantico
Run123321	Run Errands - Rectificadora Arnuld	Calle 39 # 43-12	Centro	Barranquilla	Atlantico
Run123322	Run Errands - Matercon's Ferretería	Calle 110 # 37 - 86	Las Estrellas	Barranquilla	Atlantico
Run123323	Run Errands - Campesino 72	Calle 72 # 41C-55	Prueba	Barranquilla	Atlantico
Run123324	Run Errands - Fruvecol 90	Carrera 43 # 90 - 56	Centro	Barranquilla	Atlantico
Run123325	Run Errands - AV Diseño	Carrera 27 # 64-38	Nueva Granada	Barranquilla	Atlantico
Run123326	Run Errands - Oxxo de la 70	Cl. 70 #47-23	Centro	Barranquilla	Atlantico
Run123327	Run Errands - Narcobollo 20	Carrera 43 # 84-188	Centro	Barranquilla	Atlantico
Run123328	Run Errands - Restaurante Zaitun	Calle 79 #51B - 26	Alto Prado	Barranquilla	Atlantico
Run123329	Run Errands - Consultorio UNIMEC	Carrera 50 #80 - 18	Alto Prado	Barranquilla	Atlantico
Run123330	Run Errands - Banco De Bogotá 53	Calle 53 # 46 - 27	Barrio Abajo	Barranquilla	Atlantico
Run123331	Run Errands - Olimpica Torres	Calle 53 # 52 - 68	Barrio Abajo	Barranquilla	Atlantico
Run123332	Run Errands - Puerta de Oro - Centro de Eventos	Via 40 #79B – 06	Riomar	Barranquilla	Atlantico
Run123333	Run Errands - Ferreteria 27	Carrera 27 # 84 - 56	El Eden	Barranquilla	Atlantico
Run123334	Run Errands - Restaurante La Granja	Carrera 46 #84-131	Centro	Barranquilla	Atlantico
Run123335	Run Errands - Restaurante Amalín	Carrera 52 #79 - 249	Villa Country	Barranquilla	Atlantico
Run123336	Run Errands - SAO 93	Calle 93 # 45B-90	El Poblado	Barranquilla	Atlantico
Run123337	Run Errands - TecniClear	Carrera 43 #56-09	Boston	Barranquilla	Atlantico
Run123338	Run Errands - Urban Food	Carrera 29 #26-04	Hipodromo	Soledad	Atlantico
Run123339	Run Errands - Sancochos Claudia	Calle 130 # 8K-12	Caribe Verde	Barranquilla	Atlantico
Run123340	Run Errands - Districreser	Calle 54 # 53-39	Prueba	Barranquilla	Atlantico
Run123341	Run Errands - Marta Florian	Carrera 32 # 68b -12	Olaya	Barranquilla	Atlantico
Run123342	Run Errands - Edificio Carmen Ebrat	Carrera 43 #84B-51	Nuevo Horizonte	Barranquilla	Atlantico
Run123343	Run Errands - Los Buñuelos	calle 38 # 38 - 10	Centro	Barranquilla	Atlantico
Run123344	Run Errands - Yina Amezquita	Carrera 27 # 47 - 47	San Isidro	Barranquilla	Atlantico
Run123345	Run Errands - Merly Pino	Carrera 27 # 82F-14	Me Quejo	Barranquilla	Atlantico
Run123346	Run Errands - Ana Millan	Calle 60 # 37 - 57	El Recreo	Barranquilla	Atlantico
Run123347	Run Errands - Paola Bonilla	Calle 79A # 35 - 145	Mercedes Sur	Barranquilla	Atlantico
Run123348	Run Errands - Rest. Marco Brasa	Calle 88 #44-58	La Campiña	Barranquilla	Atlantico
Run123349	Run Errands - Ferretería Samir	Calle 35 # 38-55	Centro	Barranquilla	Atlantico
Run123350	Run Errands - Rosa Elena Adarraga Lerma	Calle 41 # 33 - 96	Chiquinquira	Barranquilla	Atlantico
Run123351	Run Errands - Vicky Bermejo Coronado	Calle 76 # 38A-116	Betania	Barranquilla	Atlantico
Run123352	Run Errands - Ferremateriales San Felipe	Calle 70C # 26-07	San Felipe	Barranquilla	Atlantico
Run123353	Run Errands - Basculas y Balanzas S.A.S	AV. Murillo #25-24	Alfonzo Lopez	Barranquilla	Atlantico
Run123354	Run Errands - Edificio Katty	Carrera 18 #47-30	Cevillar	Barranquilla	Atlantico
Run123355	Run Errands - Donde Pocho Fast-Food	Calle 72C #26b - 04	El Silencio	Barranquilla	Atlantico
Run123356	Run Errands - Dental Surti Salud	Carrera 42F #75B-124	Ciudad Jardin	Barranquilla	Atlantico
Run123357	Run Errands - Droguería La Botica	Calle 84 #43B-26	Nuevo Horizonte	Barranquilla	Atlantico
Run123358	Run Errands - Droguería Farmavida De La 43	Carrera 43B #87-05	La Campiña	Barranquilla	Atlantico
Run123359	Run Errands - Restaurante Isbelia	Calle 37 # 36-103	San Roque	Barranquilla	Atlantico
Run123360	Run Errands - Subs Corp S.A.S.	Carrera 73 # 75-147	La Concepcion	Barranquilla	Atlantico
Run123361	Run Errands - Complejo San Fernando Del Tabor	Calle 96 # 42C-29	El Tabor	Barranquilla	Atlantico
Run123362	Run Errands - Supertec Olimpica	Calle 72 # 47-00	Colombia	Barranquilla	Atlantico
Run123363	Run Errands - Yini Cuentas	Calle 40 # 14-50	La Victoria	Barranquilla	Atlantico
Run123364	Run Errands - Supergiro 27	Carrera 27 # 64-26	Nueva Granada	Barranquilla	Atlantico
Run123365	Run Errands - El Gran Langostino Tienda	Carrera 43 # 69 -76	Las Delicias	Barranquilla	Atlantico
Run123366	Run Errands - Servientrega 70	Calle 70 # 52-57	El Prado	Barranquilla	Atlantico
Run123367	Run Errands - Rest. Los Comuneros	Calle 39 # 24-87	Montes	Barranquilla	Atlantico
Run123368	Run Errands - Tienda D1	Carrera 41 # 74 - esquina	Betania	Barranquilla	Atlantico
Run123369	Run Errands - Conjunto Silbador	Calle 114 # 43B-83	Alameda del Rio	Barranquilla	Atlantico
Run123370	Run Errands - Eileen Patricia Maury	Carrera 19D # 39-08	San Jose	Barranquilla	Atlantico
`.trim();

async function main() {
  // 1) Puntos de venta (idempotente por nombre)
  const existentesPdv = await prisma.errandsPuntoVenta.findMany({ select: { nombre: true } });
  const nombresPdv = new Set(existentesPdv.map((p) => p.nombre));
  let indicador = (await prisma.errandsPuntoVenta.aggregate({ _max: { indicador: true } }))._max.indicador ?? 0;
  let pdvCreados = 0;
  for (const nombre of PUNTOS_VENTA) {
    if (nombresPdv.has(nombre)) continue;
    indicador += 1;
    await prisma.errandsPuntoVenta.create({ data: { nombre, indicador } });
    pdvCreados++;
  }
  console.log(`Puntos de venta creados: ${pdvCreados} (ya existían: ${PUNTOS_VENTA.length - pdvCreados})`);

  // 2) Clientes/destinos (idempotente por nombre normalizado)
  const filas = CLIENTES_TSV.split("\n").map((l) => l.split("\t"));
  const existentesCli = await prisma.errandsCliente.findMany({ select: { nombre: true } });
  const nombresCli = new Set(existentesCli.map((c) => c.nombre.trim().toLowerCase()));

  const rows = await prisma.errandsCliente.findMany({ select: { codigo: true } });
  let maxCodigo = 0;
  for (const r of rows) {
    const m = /^ERR(\d+)$/.exec(r.codigo);
    if (m) maxCodigo = Math.max(maxCodigo, Number(m[1]));
  }

  let clientesCreados = 0;
  let clientesOmitidos = 0;
  for (const cols of filas) {
    const [, destinoRaw, direccion, barrio, ciudad, region] = cols;
    if (!destinoRaw) continue;
    const nombre = destinoRaw.replace(/^Run Errands\s*-\s*/i, "").trim();
    if (!nombre) continue;
    if (nombresCli.has(nombre.toLowerCase())) { clientesOmitidos++; continue; }
    maxCodigo += 1;
    await prisma.errandsCliente.create({
      data: {
        codigo: `ERR${String(maxCodigo).padStart(5, "0")}`,
        nombre,
        direccion: direccion?.trim() || null,
        barrio: barrio?.trim() || null,
        ciudad: ciudad?.trim() || null,
        region: region?.trim() || null,
      },
    });
    nombresCli.add(nombre.toLowerCase());
    clientesCreados++;
  }
  console.log(`Clientes creados: ${clientesCreados} (omitidos por duplicado: ${clientesOmitidos})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
