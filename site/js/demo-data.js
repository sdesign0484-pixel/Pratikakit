// Données FICTIVES, utilisées uniquement avec ?demo=1 pour prévisualiser le design.
export const categories = [
  { id: 'c1', slug: 'gestion-activite', name: "Gestion d'activité", description: 'Suivre ses clients, ses ventes et son quotidien.', display_order: 0 },
  { id: 'c2', slug: 'entrepreneuriat-pme', name: 'Entrepreneuriat & PME', description: 'Piloter une petite entreprise.', display_order: 1 },
  { id: 'c3', slug: 'creation-contenu', name: 'Création de contenu', description: 'Planifier et produire du contenu régulièrement.', display_order: 3 },
  { id: 'c4', slug: 'productivite', name: 'Productivité', description: 'Gagner du temps au quotidien.', display_order: 2 },
];

export const tools = [
  {
    id: 't1', slug: 'calendrier-editorial', name: 'Calendrier éditorial multi-marques',
    short_description: 'Planifiez les publications de plusieurs marques dans un seul calendrier, avec import et export.',
    long_description: "Un calendrier pour organiser vos publications semaine par semaine.\n\nChaque marque garde ses couleurs, ses réseaux et ses idées. Les données restent dans votre navigateur et s'exportent en un clic.",
    category_id: 'c3', image_url: null,
    problems_solved: ['Publier sans plan et oublier des dates clés', 'Jongler entre plusieurs marques dans des fichiers séparés'],
    features: ['Plusieurs marques dans un même outil', 'Vue mensuelle et liste', 'Export et import des données'],
    price_amount: 25000, currency: 'MGA', access_duration_days: null, status: 'available', display_order: 0,
  },
  {
    id: 't2', slug: 'suivi-tresorerie', name: 'Suivi de trésorerie simple',
    short_description: 'Notez vos entrées et sorties et voyez en un coup d\'œil ce qui reste en caisse.',
    long_description: null, category_id: 'c1', image_url: null,
    problems_solved: ['Ne pas savoir où part l\'argent en fin de mois'],
    features: ['Entrées et sorties par catégorie', 'Solde du mois'],
    price_amount: 15000, currency: 'MGA', access_duration_days: 365, status: 'available', display_order: 1,
  },
  {
    id: 't3', slug: 'devis-factures', name: 'Devis et factures',
    short_description: 'Préparez des devis et factures propres à imprimer ou à envoyer en PDF.',
    long_description: null, category_id: 'c2', image_url: null,
    problems_solved: ['Perdre du temps à refaire la mise en page à chaque devis'],
    features: ['Modèles personnalisables', 'Numérotation automatique'],
    price_amount: 0, currency: 'MGA', access_duration_days: null, status: 'available', display_order: 2,
  },
  {
    id: 't4', slug: 'carnet-clients', name: 'Carnet de clients',
    short_description: 'Gardez l\'historique de vos clients et les prochains rappels au même endroit.',
    long_description: null, category_id: 'c1', image_url: null,
    problems_solved: [], features: ['Fiche client', 'Rappels'],
    price_amount: 12000, currency: 'MGA', access_duration_days: null, status: 'coming_soon', display_order: 3,
  },
  {
    id: 't5', slug: 'planning-equipe', name: 'Planning d\'équipe',
    short_description: 'Répartissez les tâches de la semaine entre les membres de votre petite équipe.',
    long_description: null, category_id: 'c4', image_url: null,
    problems_solved: ['Oublier qui fait quoi'], features: ['Tableau par semaine'],
    price_amount: 18000, currency: 'MGA', access_duration_days: 90, status: 'unavailable', display_order: 4,
  },
  {
    id: 't6', slug: 'idees-contenu', name: 'Banque d\'idées de contenu',
    short_description: 'Rangez vos idées de publications et retrouvez-les quand vous en avez besoin.',
    long_description: null, category_id: 'c3', image_url: null,
    problems_solved: [], features: [],
    price_amount: 0, currency: 'MGA', access_duration_days: null, status: 'available', display_order: 5,
  },
];
