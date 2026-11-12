import {
  RegionInfo,
  SoilInfo,
  SoilTypeId,
  FoundationTypeId,
  WallMaterialId,
  WindowConstructionTypeId,
  RoofInsulationTypeId,
  WallInsulationTypeId
} from '../types';

export const REGIONS_RF: RegionInfo[] = [
  {
    id: 'moscow',
    name: 'Москва и Московская область',
    lat: 55.7558,
    lng: 37.6173,
    snowZone: 3,
    snowLoadSg: 150,
    frostDepth: 1.4,
    gsop: 4550,
    rReqWall: 3.13,
    defaultSoil: 'loam',
    climateSummary: 'Умеренно-континентальный климат, III снеговой район, преобладают пучинистые суглинки.'
  },
  {
    id: 'spb',
    name: 'Санкт-Петербург и Ленинградская обл.',
    lat: 59.9343,
    lng: 30.3351,
    snowZone: 4,
    snowLoadSg: 200,
    frostDepth: 1.45,
    gsop: 4790,
    rReqWall: 3.23,
    defaultSoil: 'peat',
    climateSummary: 'Влажный морской климат, IV снеговой район, высокий УГВ, часто встречаются торфяники и плывуны.'
  },
  {
    id: 'krasnodar',
    name: 'Краснодарский край (Краснодар / Сочи)',
    lat: 45.0355,
    lng: 38.9753,
    snowZone: 2,
    snowLoadSg: 100,
    frostDepth: 0.8,
    gsop: 2690,
    rReqWall: 2.34,
    defaultSoil: 'loam',
    climateSummary: 'Южный мягкий климат, II снеговой район, минимальное промерзание, жаркое лето (высокая инсоляция).'
  },
  {
    id: 'astrakhan',
    name: 'Астраханская область / Калмыкия',
    lat: 46.3497,
    lng: 48.0408,
    snowZone: 1,
    snowLoadSg: 50,
    frostDepth: 0.9,
    gsop: 3100,
    rReqWall: 2.48,
    defaultSoil: 'sand',
    climateSummary: 'Резко континентальный засушливый климат, I снеговой район, супесчаные и песчаные грунты.'
  },
  {
    id: 'kazan',
    name: 'Республика Татарстан (Казань)',
    lat: 55.7961,
    lng: 49.1064,
    snowZone: 5,
    snowLoadSg: 250,
    frostDepth: 1.7,
    gsop: 5300,
    rReqWall: 3.42,
    defaultSoil: 'loam',
    climateSummary: 'Поволжье, V снеговой район (высокая снеговая нагрузка), плотные суглинки и глины.'
  },
  {
    id: 'ekaterinburg',
    name: 'Свердловская область (Екатеринбург / Урал)',
    lat: 56.8389,
    lng: 60.6057,
    snowZone: 4,
    snowLoadSg: 200,
    frostDepth: 1.9,
    gsop: 5980,
    rReqWall: 3.64,
    defaultSoil: 'rock',
    climateSummary: 'Урал, IV снеговой район, глубокое промерзание до 1.9 м, скальные и крупнообломочные грунты.'
  },
  {
    id: 'novosibirsk',
    name: 'Новосибирская область (Западная Сибирь)',
    lat: 55.0084,
    lng: 82.9357,
    snowZone: 4,
    snowLoadSg: 200,
    frostDepth: 2.2,
    gsop: 6600,
    rReqWall: 3.85,
    defaultSoil: 'loam',
    climateSummary: 'Сибирь, суровые зимы, промерзание 2.2 м, требуется усиленная теплозащита стен.'
  },
  {
    id: 'perm',
    name: 'Пермский край / Сыктывкар',
    lat: 58.0105,
    lng: 56.2502,
    snowZone: 6,
    snowLoadSg: 300,
    frostDepth: 2.0,
    gsop: 6150,
    rReqWall: 3.70,
    defaultSoil: 'loam',
    climateSummary: 'Предуралье, VI снеговой район (экстремальный вес снега 300 кг/м² норматива).'
  },
  {
    id: 'murmansk',
    name: 'Мурманская область / Камчатка',
    lat: 68.9585,
    lng: 33.0827,
    snowZone: 7,
    snowLoadSg: 350,
    frostDepth: 2.3,
    gsop: 6800,
    rReqWall: 3.95,
    defaultSoil: 'rock',
    climateSummary: 'Крайний Север, VII снеговой район, полярная ночь/день, ветровые и снеговые перегрузки.'
  },
  {
    id: 'norilsk',
    name: 'Норильск / Арктическая зона (VIII район)',
    lat: 69.3558,
    lng: 88.1893,
    snowZone: 8,
    snowLoadSg: 400,
    frostDepth: 2.8,
    gsop: 8400,
    rReqWall: 4.50,
    defaultSoil: 'rock',
    climateSummary: 'VIII снеговой район (максимальный в РФ — 400 кг/м² норматива, 560 кг/м² расчетный).'
  }
];

export const SOILS_DB: Record<SoilTypeId, SoilInfo> = {
  rock: {
    id: 'rock',
    name: 'Скальный / Крупнообломочный / Гравелистый песок',
    bearingCapacityR0: 500, // 400-600 kPa
    heavingClass: 'Непучинистый',
    recommendedFoundations: ['mzlf', 'slab'],
    description: 'R0 ≈ 400–600 кПа (50 т/м²). Идеальное основание, не подвержено морозному пучению.',
    recommendationText: 'Рекомендуется МЗЛФ (мелкозаглубленная лента) или столбчатый/плитный фундамент без глубокого заложения.'
  },
  sand: {
    id: 'sand',
    name: 'Песок средней крупности / Супесь сухая',
    bearingCapacityR0: 275, // 250-300 kPa
    heavingClass: 'Слабопучинистый',
    recommendedFoundations: ['mzlf', 'slab'],
    description: 'R0 ≈ 250–300 кПа (27.5 т/м²). Хорошо дренирует воду при низком уровне грунтовых вод.',
    recommendationText: 'Рекомендуется МЗЛФ с утепленной отмосткой и песчаной подушкой 300 мм или монолитная ЖБ плита.'
  },
  loam: {
    id: 'loam',
    name: 'Суглинок / Глина пластичная (Подмосковье и средняя полоса)',
    bearingCapacityR0: 180, // 150-250 kPa
    heavingClass: 'Средне- и сильнопучинистый при высоком УГВ',
    recommendedFoundations: ['deep_strip', 'slab', 'piles'],
    description: 'R0 ≈ 150–250 кПа (18 т/м²). Удерживает влагу, при замерзании расширяется до 10–12%.',
    recommendationText: 'Рекомендуется ленточный фундамент ниже глубины промерзания, свайно-ростверковый ЖБ или УШП (утепленная шведская плита) с кольцевым дренажем.'
  },
  peat: {
    id: 'peat',
    name: 'Торфяник / Плывун / Насыпной грунт',
    bearingCapacityR0: 80, // < 100 kPa
    heavingClass: 'Сильносжимаемый слабонесущий грунт',
    recommendedFoundations: ['piles', 'slab'],
    description: 'R0 < 100 кПа (8 т/м²). Высокий риск неравномерной осадки и крена здания.',
    recommendationText: 'Рекомендуются забивные ЖБ сваи или винтовые сваи с опиранием на плотный несущий слой, либо полная выемка торфа с замещением трамбованным песком под плиту.'
  }
};

export const FOUNDATION_NAMES: Record<FoundationTypeId, { name: string; baseWidthM: number; description: string }> = {
  mzlf: {
    name: 'МЗЛФ (Мелкозаглубленная лента 400×600 мм)',
    baseWidthM: 0.4,
    description: 'Заглубление 40–50 см с утепленной пеноплексом отмосткой и песчано-щебеночной подушкой.'
  },
  deep_strip: {
    name: 'Ленточный полнозаглубленный (ниже промерзания, подошва 500 мм)',
    baseWidthM: 0.5,
    description: 'Монолитная ЖБ лента с опорой ниже глубины сезонного промерзания грунта.'
  },
  slab: {
    name: 'Монолитная ЖБ плита / УШП (толщина 300 мм)',
    baseWidthM: 0, // uses full footprint area
    description: 'Сплошная армированная плита под всем домом — минимальное удельное давление на грунт.'
  },
  piles: {
    name: 'Свайно-ростверковый (забивные ЖБ сваи 200×200 мм + ростверк)',
    baseWidthM: 0.35,
    description: 'Передача нагрузки через слабые верхние слои на плотные глубинные грунты.'
  }
};

export const WALL_MATERIALS_INFO: Record<WallMaterialId, { name: string; fireType: 'stone' | 'mixed' | 'wood'; densityKgM3: number }> = {
  aerated_concrete: {
    name: 'Газобетон автоклавный D400',
    fireType: 'stone',
    densityKgM3: 450
  },
  ceramic_block: {
    name: 'Керамический блок / Кирпич с утеплением',
    fireType: 'stone',
    densityKgM3: 950
  },
  frame: {
    name: 'Каркасная технология с базальтовой ватой',
    fireType: 'wood',
    densityKgM3: 180
  },
  timber: {
    name: 'Клееный / Профилированный брус',
    fireType: 'wood',
    densityKgM3: 520
  }
};

export const WINDOW_TYPES_INFO: Record<
  WindowConstructionTypeId,
  {
    id: WindowConstructionTypeId;
    name: string;
    shortName: string;
    frameType: 'wood' | 'pvc';
    frameMaterial: 'wood' | 'pvc';
    glassCount: 1 | 2 | 3;
    rValue: number; // м²·°С/Вт
    thermalResistanceR: number; // м²·°С/Вт
    uValue: number; // Вт/(м²·°С)
    heatTransferU: number; // Вт/(м²·°С)
    solarTransmittanceG: number;
    costPerSqmRub: number;
    description: string;
  }
> = {
  wood_single_glass: {
    id: 'wood_single_glass',
    name: 'Деревянные окна с одинарным остеклением (1 стекло)',
    shortName: 'Деревянные (1 стекло)',
    frameType: 'wood',
    frameMaterial: 'wood',
    glassCount: 1,
    rValue: 0.18,
    thermalResistanceR: 0.18,
    uValue: 5.56,
    heatTransferU: 5.56,
    solarTransmittanceG: 0.85,
    costPerSqmRub: 6800,
    description: 'Классическая деревянная рама с одним листовым стеклом 4 мм. Высокие теплопотери (R = 0.18 м²·°С/Вт), подходит только для летних дач, веранд и хозпостроек.'
  },
  wood_double_glass: {
    id: 'wood_double_glass',
    name: 'Деревянные окна со спаренным переплетом (2 стекла)',
    shortName: 'Деревянные (2 стекла)',
    frameType: 'wood',
    frameMaterial: 'wood',
    glassCount: 2,
    rValue: 0.42,
    thermalResistanceR: 0.42,
    uValue: 2.38,
    heatTransferU: 2.38,
    solarTransmittanceG: 0.76,
    costPerSqmRub: 11200,
    description: 'Деревянный переплет по ГОСТ 24700 с двумя стеклами и воздушной прослойкой (R = 0.42 м²·°С/Вт). Для бань и домов сезонного проживания.'
  },
  pvc_single_chamber: {
    id: 'pvc_single_chamber',
    name: 'Пластиковый ПВХ-профиль: одинарный (1-камерный) стеклопакет (4-16-4)',
    shortName: 'ПВХ + одинарный стеклопакет',
    frameType: 'pvc',
    frameMaterial: 'pvc',
    glassCount: 2,
    rValue: 0.54,
    thermalResistanceR: 0.54,
    uValue: 1.85,
    heatTransferU: 1.85,
    solarTransmittanceG: 0.74,
    costPerSqmRub: 12900,
    description: 'ПВХ-профиль 60 мм с однокамерным стеклопакетом 24 мм (2 стекла). R = 0.54 м²·°С/Вт — базовый вариант для южных регионов или дач.'
  },
  pvc_double_chamber: {
    id: 'pvc_double_chamber',
    name: 'Пластиковый ПВХ-профиль: двойной (2-камерный энергосберегающий) стеклопакет (4-14-4-14-4i)',
    shortName: 'ПВХ + двойной стеклопакет',
    frameType: 'pvc',
    frameMaterial: 'pvc',
    glassCount: 3,
    rValue: 0.78,
    thermalResistanceR: 0.78,
    uValue: 1.28,
    heatTransferU: 1.28,
    solarTransmittanceG: 0.65,
    costPerSqmRub: 16500,
    description: 'Многокамерный ПВХ-профиль 70–80 мм с двухкамерным энергосберегающим стеклопакетом (3 стекла, напыление i-стекла). R = 0.78 м²·°С/Вт — стандарт ПМЖ по СП 50.13330.'
  }
};

export const ROOF_INSULATION_INFO: Record<
  RoofInsulationTypeId,
  {
    id: RoofInsulationTypeId;
    name: string;
    shortName: string;
    thicknessMm: number;
    rValue: number; // м²·°С/Вт
    thermalResistanceR: number; // м²·°С/Вт
    uValue: number; // Вт/(м²·°С)
    heatTransferU: number; // Вт/(м²·°С)
    costPerSqmRub: number;
    description: string;
  }
> = {
  none: {
    id: 'none',
    name: 'Без утепления (холодная кровля по обрешетке)',
    shortName: 'Без утепления (холодная)',
    thicknessMm: 0,
    rValue: 0.35,
    thermalResistanceR: 0.35,
    uValue: 2.86,
    heatTransferU: 2.86,
    costPerSqmRub: 0,
    description: 'Неутепленные стропила и кровельное покрытие (R = 0.35 м²·°С/Вт). Высокие теплопотери через верхнее перекрытие при отапливаемом контуре.'
  },
  mineral_wool_150: {
    id: 'mineral_wool_150',
    name: 'Каменная минвата 150 мм между стропил (базовое утепление)',
    shortName: 'Минвата 150 мм',
    thicknessMm: 150,
    rValue: 3.65,
    thermalResistanceR: 3.65,
    uValue: 0.27,
    heatTransferU: 0.27,
    costPerSqmRub: 1450,
    description: 'Утепление базальтовыми плитами 150 мм с пароизоляцией и супердиффузионной мембраной (R = 3.65 м²·°С/Вт). Для мягкого климата или домов сезонного проживания.'
  },
  mineral_wool_200_50: {
    id: 'mineral_wool_200_50',
    name: 'Базальтовая вата 200+50 мм с перекрестным контр-утеплением (ПМЖ)',
    shortName: 'Минвата 200+50 мм (ПМЖ)',
    thicknessMm: 250,
    rValue: 5.45,
    thermalResistanceR: 5.45,
    uValue: 0.18,
    heatTransferU: 0.18,
    costPerSqmRub: 2350,
    description: '200 мм между стропил + 50 мм перекрестного контр-утепления поперек стропил (перекрывает мостики холода). R = 5.45 м²·°С/Вт — оптимально для ПМЖ по СП 50.13330.'
  },
  pir_puf_150: {
    id: 'pir_puf_150',
    name: 'Напыляемый ППУ / теплоизоляционные плиты PIR 160 мм (энергоэффективная мансарда)',
    shortName: 'Плиты PIR / ППУ 160 мм',
    thicknessMm: 160,
    rValue: 6.40,
    thermalResistanceR: 6.40,
    uValue: 0.16,
    heatTransferU: 0.16,
    costPerSqmRub: 3600,
    description: 'Бесшовный закрытоячеистый ППУ или фольгированные плиты PIR (λ = 0.022 Вт/м·°С). Максимальная теплозащита кровли R = 6.40 м²·°С/Вт.'
  },
  ecowool_250: {
    id: 'ecowool_250',
    name: 'Эковата / засыпное чердачное утепление 250 мм по перекрытию',
    shortName: 'Эковата 250 мм (чердак)',
    thicknessMm: 250,
    rValue: 5.80,
    thermalResistanceR: 5.80,
    uValue: 0.17,
    heatTransferU: 0.17,
    costPerSqmRub: 1950,
    description: 'Бесшовная задувка целлюлозной эковаты 250 мм по чердачному перекрытию или скатам (R = 5.80 м²·°С/Вт). Отсутствие стыков и высокая теплоемкость.'
  }
};

export const WALL_INSULATION_INFO: Record<
  WallInsulationTypeId,
  {
    id: WallInsulationTypeId;
    name: string;
    shortName: string;
    thicknessMm: number;
    bonusRValue: number; // добавочное сопротивление теплопередаче +ΔR (м²·°С/Вт)
    bonusThermalResistanceR: number; // +ΔR (м²·°С/Вт)
    costPerSqmRub: number;
    description: string;
  }
> = {
  none: {
    id: 'none',
    name: 'Без дополнительного утепления (однослойная несущая стена)',
    shortName: 'Без утепления (+0.00 R)',
    thicknessMm: 0,
    bonusRValue: 0,
    bonusThermalResistanceR: 0,
    costPerSqmRub: 0,
    description: 'Теплозащита обеспечивается только толщиной и материалом самой несущей стены.'
  },
  mineral_wool_50: {
    id: 'mineral_wool_50',
    name: 'Каменная (базальтовая) вата 50 мм (вентфасад / под сайдинг или планкен)',
    shortName: 'Минвата 50 мм (+1.25 R)',
    thicknessMm: 50,
    bonusRValue: 1.25,
    bonusThermalResistanceR: 1.25,
    costPerSqmRub: 950,
    description: 'Наружное доутепление фасадной базальтовой плитой 50 мм с ветрозащитной мембраной (+1.25 м²·°С/Вт к R стены).'
  },
  mineral_wool_100: {
    id: 'mineral_wool_100',
    name: 'Каменная (базальтовая) вата 100 мм (мокрый фасад СФТК / вентфасад)',
    shortName: 'Минвата 100 мм (+2.50 R)',
    thicknessMm: 100,
    bonusRValue: 2.50,
    bonusThermalResistanceR: 2.50,
    costPerSqmRub: 1850,
    description: 'Паропроницаемое фасадное утепление 100 мм плотностью 90–135 кг/м³ (+2.50 м²·°С/Вт). Идеально для газобетона, кирпича и бруса.'
  },
  mineral_wool_150: {
    id: 'mineral_wool_150',
    name: 'Каменная вата 150 мм (энергоэффективный контур 100+50 мм с перекрытием швов)',
    shortName: 'Минвата 150 мм (+3.75 R)',
    thicknessMm: 150,
    bonusRValue: 3.75,
    bonusThermalResistanceR: 3.75,
    costPerSqmRub: 2650,
    description: 'Двухслойное наружное утепление 150 мм для северных регионов и домов класса А+/А++ (+3.75 м²·°С/Вт).'
  },
  eps_100: {
    id: 'eps_100',
    name: 'Фасадный пенополистирол ППС-16Ф 100 мм (штукатурный фасад СФТК)',
    shortName: 'ППС-16Ф 100 мм (+2.65 R)',
    thicknessMm: 100,
    bonusRValue: 2.65,
    bonusThermalResistanceR: 2.65,
    costPerSqmRub: 1450,
    description: 'Система фасадная теплоизоляционная композиционная (СФТК) с пенополистиролом 100 мм (+2.65 м²·°С/Вт). Подходит для кирпича, керамоблока и монолита.'
  },
  pir_80: {
    id: 'pir_80',
    name: 'Теплоизоляционные плиты PIR / ЭППС 80 мм (высокоэффективный контур)',
    shortName: 'Плиты PIR 80 мм (+3.45 R)',
    thicknessMm: 80,
    bonusRValue: 3.45,
    bonusThermalResistanceR: 3.45,
    costPerSqmRub: 2800,
    description: 'Тонкослойное высокоэффективное утепление плитами полиизоцианурата 80 мм (+3.45 м²·°С/Вт при минимальной толщине).'
  }
};

export const BUILDING_CATEGORY_LABELS: Record<
  string,
  { label: string; shortLabel: string; color: string; protectiveBufferM?: number; normCode?: string }
> = {
  house: { label: 'Жилой дом', shortLabel: 'Дом', color: '#3b82f6' },
  bathhouse: { label: 'Баня / Сауна', shortLabel: 'Баня', color: '#f59e0b' },
  garage: { label: 'Гараж', shortLabel: 'Гараж', color: '#64748b' },
  shed: { label: 'Сарай / Хозблок', shortLabel: 'Хозблок', color: '#10b981' },
  greenhouse: { label: 'Теплица', shortLabel: 'Теплица', color: '#34d399' },
  poultry: { label: 'Птичник / Постройка для скота', shortLabel: 'Птичник', color: '#a855f7' },
  toilet: { label: 'Уличный туалет / Септик / Компост', shortLabel: 'Септик', color: '#ef4444' },
  well: { label: 'Скважина / Колодец', shortLabel: 'Скважина', color: '#06b6d4' },
  neighbor_house: { label: 'Соседский дом (за границей)', shortLabel: 'Дом соседа', color: '#94a3b8' },
  neighbor_well: { label: 'Соседский колодец (за границей)', shortLabel: 'Колодец соседа', color: '#38bdf8' },
  forest: {
    label: 'Лесной массив (Гослесфонд)',
    shortLabel: 'Лес',
    color: '#15803d',
    protectiveBufferM: 15,
    normCode: 'СП 4.13130.2013 п. 4.14 (15 м до леса)'
  },
  tree_tall: {
    label: 'Высокорослое дерево (яблоня, сосна, береза)',
    shortLabel: 'Дерево высок.',
    color: '#22c55e',
    protectiveBufferM: 4,
    normCode: 'СП 53.13330.2019 п. 6.7 (4 м от межи, 5 м от стен дома)'
  },
  tree_medium: {
    label: 'Среднерослое дерево / Кустарник',
    shortLabel: 'Дерево средн.',
    color: '#4ade80',
    protectiveBufferM: 2,
    normCode: 'СП 53.13330.2019 п. 6.7 (2 м от межи)'
  },
  water_body: {
    label: 'Ручей / Река / Пруд (Водоем)',
    shortLabel: 'Водоем',
    color: '#0284c7',
    protectiveBufferM: 20,
    normCode: 'ВК РФ ст. 65 (Береговая полоса и водоохранная зона 20 м)'
  },
  power_line: {
    label: 'ЛЭП (Линия электропередач 0.4–10 кВ)',
    shortLabel: 'ЛЭП',
    color: '#eab308',
    protectiveBufferM: 10,
    normCode: 'ПП РФ №160 (Охранная зона ЛЭП 10 м)'
  },
  gas_pipe: {
    label: 'Магистральный / распределительный газопровод',
    shortLabel: 'Газопровод',
    color: '#facc15',
    protectiveBufferM: 4,
    normCode: 'ПП РФ №878 / СП 42.13330 Табл. 12.5 (Охранная зона газа 4 м)'
  },
  water_main: {
    label: 'Магистральный водопровод',
    shortLabel: 'Водопровод',
    color: '#38bdf8',
    protectiveBufferM: 5,
    normCode: 'СП 42.13330.2016 Табл. 12.5 (5 м до фундамента)'
  },
  sewer_main: {
    label: 'Магистральная канализация',
    shortLabel: 'Канализация',
    color: '#b45309',
    protectiveBufferM: 3,
    normCode: 'СП 42.13330.2016 Табл. 12.5 (3 м до фундамента, 10 м до колодца)'
  },
  road: {
    label: 'Автодорога / Улица / Проезд',
    shortLabel: 'Дорога',
    color: '#475569',
    protectiveBufferM: 5,
    normCode: 'СП 53.13330.2019 п. 6.6 (5 м от красной линии дороги)'
  }
};
