export const OFFENSE_RESOURCE = "f36bb931-8fb4-481c-83d9-a3589108bb20";
export const CFS_RESOURCE = "9cb17985-ac16-49a6-ad69-6fe5ad8f2bf5";
export const CKAN_SQL = "https://data.sanantonio.gov/api/3/action/datastore_search_sql";
export const CKAN_RESOURCE = "https://data.sanantonio.gov/api/3/action/resource_show";

export const SA_CENTER: [number, number] = [29.436, -98.51];
export const SA_BOUNDS: [[number, number], [number, number]] = [
  [29.08, -98.9],
  [29.78, -98.05],
];

export const RANGES = [
  { id: "30d", labelKey: "range.30d" },
  { id: "90d", labelKey: "range.90d" },
  { id: "ytd", labelKey: "range.ytd" },
  { id: "12m", labelKey: "range.12m" },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];

export const AGAINST = [
  { id: "ALL", labelKey: "against.ALL" },
  { id: "PERSON", labelKey: "against.PERSON" },
  { id: "PROPERTY", labelKey: "against.PROPERTY" },
  { id: "SOCIETY", labelKey: "against.SOCIETY" },
] as const;

export type AgainstId = (typeof AGAINST)[number]["id"];

export const NIBRS_GROUPS = [
  "Larceny/Theft Offenses",
  "Assault Offenses",
  "Destruction/Damage/Vandalism of Property",
  "Drug/Narcotics Offenses",
  "Fraud Offenses",
  "Motor Vehicle Theft",
  "Breaking & Entering",
  "Sex Offenses, Forcible",
  "Weapon Law Violations",
  "Robbery",
  "Counterfeiting/Forgery",
  "Pornography/Obscene Material",
  "Stolen Property Offenses",
  "Embezzlement",
  "Animal Cruelty",
  "Prostitution Offenses",
  "Kidnapping/Abduction",
  "Arson",
  "Extortion/Blackmail",
  "Homicide Offenses",
  "Human Trafficking",
  "Gambling Offenses",
  "Bribery",
  "Sex Offenses, Nonforcible",
] as const;

export type NibrsGroup = (typeof NIBRS_GROUPS)[number];

export const GROUP_SHORT: Record<string, string> = {
  "Larceny/Theft Offenses": "Theft",
  "Assault Offenses": "Assault",
  "Destruction/Damage/Vandalism of Property": "Vandalism",
  "Drug/Narcotics Offenses": "Drugs",
  "Fraud Offenses": "Fraud",
  "Motor Vehicle Theft": "Auto theft",
  "Breaking & Entering": "Burglary",
  "Sex Offenses, Forcible": "Sex offenses",
  "Weapon Law Violations": "Weapons",
  Robbery: "Robbery",
  "Counterfeiting/Forgery": "Forgery",
  "Pornography/Obscene Material": "Pornography",
  "Stolen Property Offenses": "Stolen property",
  Embezzlement: "Embezzlement",
  "Animal Cruelty": "Animal cruelty",
  "Prostitution Offenses": "Prostitution",
  "Kidnapping/Abduction": "Kidnapping",
  Arson: "Arson",
  "Extortion/Blackmail": "Extortion",
  "Homicide Offenses": "Homicide",
  "Human Trafficking": "Trafficking",
  "Gambling Offenses": "Gambling",
  Bribery: "Bribery",
  "Sex Offenses, Nonforcible": "Sex offenses",
};

export const GROUP_SHORT_ES: Record<string, string> = {
  "Larceny/Theft Offenses": "Hurto",
  "Assault Offenses": "Agresión",
  "Destruction/Damage/Vandalism of Property": "Vandalismo",
  "Drug/Narcotics Offenses": "Drogas",
  "Fraud Offenses": "Fraude",
  "Motor Vehicle Theft": "Auto",
  "Breaking & Entering": "Allanamiento",
  "Sex Offenses, Forcible": "Delitos sexuales",
  "Weapon Law Violations": "Armas",
  Robbery: "Robo",
  "Counterfeiting/Forgery": "Falsificación",
  "Pornography/Obscene Material": "Pornografía",
  "Stolen Property Offenses": "Bienes robados",
  Embezzlement: "Desfalco",
  "Animal Cruelty": "Crueldad animal",
  "Prostitution Offenses": "Prostitución",
  "Kidnapping/Abduction": "Secuestro",
  Arson: "Incendio",
  "Extortion/Blackmail": "Extorsión",
  "Homicide Offenses": "Homicidio",
  "Human Trafficking": "Tráfico",
  "Gambling Offenses": "Juegos",
  Bribery: "Soborno",
  "Sex Offenses, Nonforcible": "Delitos sexuales",
};

export const FEATURED_GROUPS: { id: "ALL" | NibrsGroup; labelKey: string }[] = [
  { id: "ALL", labelKey: "group.ALL" },
  { id: "Assault Offenses", labelKey: "group.Assault Offenses" },
  { id: "Larceny/Theft Offenses", labelKey: "group.Larceny/Theft Offenses" },
  { id: "Motor Vehicle Theft", labelKey: "group.Motor Vehicle Theft" },
  { id: "Breaking & Entering", labelKey: "group.Breaking & Entering" },
  { id: "Drug/Narcotics Offenses", labelKey: "group.Drug/Narcotics Offenses" },
  { id: "Robbery", labelKey: "group.Robbery" },
];

export const PLACE_ZIPS: { q: string; zip: string; name: string }[] = [
  { q: "stone oak", zip: "78258", name: "Stone Oak" },
  { q: "alamo ranch", zip: "78253", name: "Alamo Ranch" },
  { q: "helotes", zip: "78023", name: "Helotes" },
  { q: "alamo heights", zip: "78209", name: "Alamo Heights" },
  { q: "southtown", zip: "78205", name: "Southtown" },
  { q: "pearl", zip: "78215", name: "Pearl" },
  { q: "medical center", zip: "78229", name: "Medical Center" },
  { q: "downtown", zip: "78205", name: "Downtown" },
  { q: "westside", zip: "78207", name: "Westside" },
  { q: "eastside", zip: "78202", name: "Eastside" },
  { q: "leon valley", zip: "78238", name: "Leon Valley" },
  { q: "converse", zip: "78109", name: "Converse" },
  { q: "universal city", zip: "78148", name: "Universal City" },
  { q: "schertz", zip: "78154", name: "Schertz" },
];

export const HEAT = [
  "var(--color-heat-0)",
  "var(--color-heat-1)",
  "var(--color-heat-2)",
  "var(--color-heat-3)",
  "var(--color-heat-4)",
] as const;

export const DOW_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DOW_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
