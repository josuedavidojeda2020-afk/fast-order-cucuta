// Fast Order Cúcuta - Master Data & Initial State

export const MENU_CATALOG = [
  {
    id: "p1",
    name: "Hamburguesa Especial Cúcuta",
    category: "Hamburguesas",
    price: 18000,
    icon: "🍔",
    image: "IMAGENES PARA PEDIR/ESPECIAL.jpg",
    description: "Carne artesanal 150g, queso costeño, tocineta crocante, ripio de papa y salsa de la casa.",
    recipe: { carne: 1, pan: 1, queso: 40, tocineta: 2, ripio: 30, salsa: 20, cebolla: 15 }
  },
  {
    id: "p_clasica",
    name: "Hamburguesa Clásica",
    category: "Hamburguesas",
    price: 14000,
    icon: "🍔",
    image: "IMAGENES PARA PEDIR/CLASICA.jpg",
    description: "Carne 120g de res, queso americano, vegetales frescos, salsas tradicionales.",
    recipe: { carne: 1, pan: 1, queso: 30, salsa: 20, cebolla: 15 }
  },
  {
    id: "p2",
    name: "Hamburguesa Doble Carne",
    category: "Hamburguesas",
    price: 24000,
    icon: "🍔",
    image: "IMAGENES PARA PEDIR/DOBLE-CARNE.jpg",
    description: "Doble carne 150g, doble queso mozzarella, jamón y cebolla caramelizada.",
    recipe: { carne: 2, pan: 1, queso: 60, tocineta: 1, ripio: 30, salsa: 30, cebolla: 25 }
  },
  {
    id: "p3",
    name: "Perro Caliente Venezolano",
    category: "Perros",
    price: 14000,
    icon: "🌭",
    image: "IMAGENES PARA PEDIR/PERRO-CALIENTE-TOCINETA.jpg",
    description: "Salchicha manguera, repollo, cebolla picadita, queso costeño rallado y tártara.",
    recipe: { salchicha: 1, panPerro: 1, queso: 30, cebolla: 20, salsa: 25, repollo: 25 }
  },
  {
    id: "p4",
    name: "Perro Especial con Tocineta",
    category: "Perros",
    price: 17000,
    icon: "🌭",
    image: "IMAGENES PARA PEDIR/PERRO-CALIENTE-TOCINETA.jpg",
    description: "Salchicha especial, tocineta picada, doble ripio, salsa de ajo y piña.",
    recipe: { salchicha: 1, panPerro: 1, queso: 30, tocineta: 2, ripio: 40, salsa: 30 }
  },
  {
    id: "p5",
    name: "Salchipapa Familiar",
    category: "Salchipapas",
    price: 28000,
    icon: "🍟",
    image: "IMAGENES PARA PEDIR/SALCHIPAPA FAMILIAR.jpg",
    description: "Papa criolla y francesa, abundante salchicha, carne desmechada, queso fundido y salsas.",
    recipe: { papa: 300, salchicha: 3, carne: 1, queso: 80, salsa: 40 }
  },
  {
    id: "p6",
    name: "Salchipapa Casera Tradicional",
    category: "Salchipapas",
    price: 16000,
    icon: "🍟",
    image: "IMAGENES PARA PEDIR/SALCHIPAPA CASERA.jpg",
    description: "Papas francesas crocantes con salchicha manguera, queso costeño y salsa tártara.",
    recipe: { papa: 200, salchicha: 2, queso: 40, salsa: 20 }
  },
  {
    id: "p7",
    name: "Salchipapa Salvaje Mixta",
    category: "Salchipapas",
    price: 29000,
    icon: "🍟",
    image: "IMAGENES PARA PEDIR/SALCHIPAPA-MIXTA.jpg",
    description: "Base mixta de papas criollas y francesas, pechuga, carne desmechada, tocineta y doble queso.",
    recipe: { papa: 350, salchicha: 3, carne: 2, queso: 90, salsa: 45 }
  },
  {
    id: "p8",
    name: "Coca-Cola 400ml",
    category: "Bebidas",
    price: 5000,
    icon: "🥤",
    image: "IMAGENES PARA PEDIR/COCA COLA 400ml.png",
    description: "Botella plástica helada, sabor original.",
    recipe: { gaseosa: 1 }
  },
  {
    id: "p9",
    name: "Gaseosa Postobón Manzana 400ml",
    category: "Bebidas",
    price: 4000,
    icon: "🥤",
    image: "IMAGENES PARA PEDIR/postobon 400ml.jpg",
    description: "Botella 400ml bien fría, sabor manzana tradicional.",
    recipe: { gaseosa: 1 }
  },
  {
    id: "p10",
    name: "Jugo Natural de Maracuyá",
    category: "Bebidas",
    price: 6000,
    icon: "🥤",
    image: "IMAGENES PARA PEDIR/JUGO-DE-MARACUYA.jpg",
    description: "Vaso de 16oz en agua fresca, pulpa 100% natural.",
    recipe: { gaseosa: 1 }
  }
];

export const PRESET_MODIFIERS = [
  { id: "mod_sin_cebolla", label: "Sin cebolla", price: 0, tagType: "remove", icon: "🧅" },
  { id: "mod_salsa_aparte", label: "Salsa aparte", price: 0, tagType: "info", icon: "🥣" },
  { id: "mod_sin_ripio", label: "Sin ripio de papa", price: 0, tagType: "remove", icon: "🚫" },
  { id: "mod_sin_tartara", label: "Sin tártara", price: 0, tagType: "remove", icon: "🚫" },
  { id: "mod_doble_queso", label: "Doble Queso", price: 3000, tagType: "add", icon: "🧀" },
  { id: "mod_extra_tocineta", label: "Extra Tocineta", price: 4000, tagType: "add", icon: "🥓" },
  { id: "mod_para_llevar", label: "Empaque Para Llevar", price: 1000, tagType: "info", icon: "🛍️" }
];

export const INITIAL_INVENTORY = [
  { id: "pan", name: "Pan de Hamburguesa", unit: "unid", stock: 45, minAlert: 15, cost: 800 },
  { id: "panPerro", name: "Pan de Perro", unit: "unid", stock: 30, minAlert: 10, cost: 700 },
  { id: "carne", name: "Carne Hamburguesa 150g", unit: "porciones", stock: 38, minAlert: 12, cost: 3500 },
  { id: "salchicha", name: "Salchichas Especiales", unit: "unid", stock: 40, minAlert: 10, cost: 1200 },
  { id: "queso", name: "Queso Costeño Rallado", unit: "gramos", stock: 2500, minAlert: 600, cost: 18 },
  { id: "tocineta", name: "Tocineta Ahumada", unit: "lonjas", stock: 60, minAlert: 15, cost: 1000 },
  { id: "cebolla", name: "Cebolla Picada", unit: "gramos", stock: 1800, minAlert: 500, cost: 6 },
  { id: "salsa", name: "Salsa de la Casa (Ajo/Tártara)", unit: "ml", stock: 3200, minAlert: 800, cost: 10 },
  { id: "papa", name: "Papa Francesa", unit: "gramos", stock: 8000, minAlert: 2000, cost: 8 },
  { id: "ripio", name: "Ripio de Papa", unit: "gramos", stock: 3000, minAlert: 800, cost: 7 },
  { id: "repollo", name: "Repollo Blanco", unit: "gramos", stock: 1500, minAlert: 400, cost: 5 },
  { id: "gaseosa", name: "Gaseosa 1.5L", unit: "unid", stock: 24, minAlert: 6, cost: 4500 }
];

export const INITIAL_TICKETS = [
  {
    id: "TICK-101",
    channel: "whatsapp",
    customerName: "Carlos Mendoza (Caobos)",
    phone: "312 456 7890",
    status: "pending",
    createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    items: [
      {
        productName: "Hamburguesa Especial Cúcuta",
        qty: 2,
        unitPrice: 18000,
        modifiers: ["Sin cebolla", "Salsa aparte", "Doble Queso"],
        notes: "Urgente, domicilio motorizado listo"
      },
      {
        productName: "Gaseosa 1.5L (Postobón/Coca-Cola)",
        qty: 1,
        unitPrice: 7000,
        modifiers: [],
        notes: "Bien fría"
      }
    ],
    total: 49000
  },
  {
    id: "TICK-102",
    channel: "counter",
    customerName: "Mesa 3 - Presencial",
    phone: "",
    status: "preparing",
    createdAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    items: [
      {
        productName: "Perro Caliente Venezolano",
        qty: 1,
        unitPrice: 14000,
        modifiers: ["Sin ripio de papa", "Empaque Para Llevar"],
        notes: "Salsa de ajo extra"
      },
      {
        productName: "Salchipapa Familiar",
        qty: 1,
        unitPrice: 28000,
        modifiers: ["Doble Queso"],
        notes: ""
      }
    ],
    total: 45000
  },
  {
    id: "TICK-100",
    channel: "whatsapp",
    customerName: "Dra. Andrea Suárez",
    phone: "315 987 6543",
    status: "dispatched",
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    dispatchedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    items: [
      {
        productName: "Hamburguesa Doble Carne",
        qty: 1,
        unitPrice: 24000,
        modifiers: ["Extra Tocineta"],
        notes: ""
      }
    ],
    total: 28000
  }
];

export const FINANCIAL_METRICS = {
  initialInvestmentCOP: 11500000,
  annualOperationalCOP: 6000000,
  monthlySubscriptionCOP: 40000,
  roiPercent: 252,
  vanCOP: 19063726,
  tirPercent: 69,
  targetErrorReduction: 40,
  targetModifierErrorReduction: 50,
  targetWasteReduction: 25,
  targetPrepTimeSpeedup: 30
};
