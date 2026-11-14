import { PlotConfig, SiteObject, RoofType } from '../types';
import {
  calculateBuildingInteriorArea,
  calculateEnergyAndHeating,
  calculatePlotReliefAndDrainage,
  calculateSnowLoad,
  calculateFoundationBearing,
  calculateBillOfMaterials,
  getEffectivePlotRegion,
  calculateWindRoseAndLoads
} from './calculations';

export interface PromoSceneStateAction {
  viewMode: '3d' | '2d';
  showForbiddenZones: boolean;
  xrayWallsMode: boolean;
  undergroundViewMode: boolean;
  thermalHeatmapMode: boolean;
  dayOfYear: number;
  hourOfDay: number;
  selectedObjectCategory?: SiteObject['category'];
  showDrainageZones?: boolean;
  /** Live interactive demo overrides for object placement/dragging & editing dimensions/floors/roof/windows */
  demoHousePatch?: {
    x?: number;
    z?: number;
    width?: number;
    length?: number;
    floors?: number;
    hasBasement?: boolean;
    roofType?: RoofType;
    southWindows?: number;
    eastWindows?: number;
    windowOffset?: number;
  };
}

export interface PromoSceneMetricPill {
  label: string;
  value: string;
  accent: 'sky' | 'emerald' | 'amber' | 'rose' | 'indigo';
}

export interface PromoVideoScene {
  id: string;
  index: number;
  startSec: number;
  durationSec: number;
  endSec: number;
  kicker: string;
  headline: string;
  subheadline: string;
  /** Плашка 1: Что происходит на экране */
  whatHappensOnScreen: string;
  /** Плашка 2: Зачем это делается (практическая и юридическая выгода) */
  whyItIsDone: string;
  /** Ссылки на СП / СНиП / ГК РФ */
  normativeCode: string;
  /** Настройки состояния приложения для живой демонстрации */
  appAction: PromoSceneStateAction;
  /** Визуальный акцент сцены для отрисовки инфографики на холсте */
  visualFocus:
    | 'site_3d_precision'
    | 'drag_and_drop_placement'
    | 'edit_dimensions_floors_roof_windows'
    | 'normative_setbacks_2d'
    | 'sun_insolation_xray'
    | 'roof_snow_foundation'
    | 'thermal_heatmap_energy'
    | 'relief_drainage_underground'
    | 'legal_claim_defense'
    | 'bom_market_pdf_mcp';
}

export type PromoVideoResolutionId = '1080p' | '1440p' | '2160p';

export interface PromoVideoResolutionSpec {
  id: PromoVideoResolutionId;
  shortLabel: string;
  label: string;
  badge: string;
  width: number;
  height: number;
  aspectRatio: '16:9';
  bitratebps: number;
}

export const PROMO_VIDEO_RESOLUTIONS: Record<PromoVideoResolutionId, PromoVideoResolutionSpec> = {
  '1080p': {
    id: '1080p',
    shortLabel: 'Full HD (1080p)',
    label: 'Full HD · 1920×1080 (16:9)',
    badge: 'FULL HD 1920×1080 · 16:9',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    bitratebps: 8_000_000
  },
  '1440p': {
    id: '1440p',
    shortLabel: '2K QHD (1440p)',
    label: '2K QHD · 2560×1440 (16:9)',
    badge: '2K QHD 2560×1440 · 16:9',
    width: 2560,
    height: 1440,
    aspectRatio: '16:9',
    bitratebps: 14_000_000
  },
  '2160p': {
    id: '2160p',
    shortLabel: '4K UHD (2160p)',
    label: '4K UHD · 3840×2160 (16:9)',
    badge: '4K UHD 3840×2160 · 16:9',
    width: 3840,
    height: 2160,
    aspectRatio: '16:9',
    bitratebps: 24_000_000
  }
};

export const PROMO_VIDEO_TOTAL_DURATION_SEC = 80;

export const PROMO_VIDEO_SCENES: PromoVideoScene[] = [
  {
    id: 'scene-01-precision-3d',
    index: 1,
    startSec: 0,
    durationSec: 8,
    endSec: 8,
    kicker: 'СЦЕНА 01 · ЦИФРОВОЙ ДВОЙНИК УЧАСТКА И ТОЧНОСТЬ 1 ММ',
    headline: 'Проектирование участка в 3D и 2D по реальным координатам РФ',
    subheadline: 'Автоматическое определение климатического района, розы ветров, границ соседей и площади застройки',
    whatHappensOnScreen:
      'В рабочей области строится точная 3D-модель основного участка, смежных соседских участков и земель госфонда. Все габариты и привязки задаются с точностью до 1 мм (через точку или запятую), а регион РФ определяется по GPS-координатам.',
    whyItIsDone:
      'Позволяет до начала строительных работ увидеть реальный масштаб застройки, исключить кадастровые ошибки, проверить пропорции дома и рационально распределить каждую сотку земли.',
    normativeCode: 'ЗК РФ · СП 30-102-99 · Точность 0.001 м',
    appAction: {
      viewMode: '3d',
      showForbiddenZones: true,
      xrayWallsMode: false,
      undergroundViewMode: false,
      thermalHeatmapMode: false,
      dayOfYear: 172,
      hourOfDay: 13.5,
      selectedObjectCategory: 'house',
      showDrainageZones: true
    },
    visualFocus: 'site_3d_precision'
  },
  {
    id: 'scene-02-drag-and-drop',
    index: 2,
    startSec: 8,
    durationSec: 8,
    endSec: 16,
    kicker: 'СЦЕНА 02 · РАЗМЕЩЕНИЕ И ПЕРЕТАСКИВАНИЕ ОБЪЕКТОВ ПО УЧАСТКУ',
    headline: 'Свободное перемещение построек мышью с живым контролем дистанций',
    subheadline: 'Добавление дома, бани, гаража, скважины и септика на генплан и перетаскивание в 2D/3D',
    whatHappensOnScreen:
      'Пользователь размещает объекты из каталога и перетаскивает жилой дом, баню и скважину по участку курсором мыши. Во время движения в реальном времени пересчитываются расстояния до границ участка, улицы, соседского дома и санитарных зон.',
    whyItIsDone:
      'Позволяет за секунды найти идеальное место для каждой постройки на участке без ручных чертежей, мгновенно видя зеленые разрешенные зоны и избегая пересечения охранных и противопожарных буферов.',
    normativeCode: 'СП 53.13330.2019 · Интерактивный Drag & Drop в 2D/3D',
    appAction: {
      viewMode: '3d',
      showForbiddenZones: true,
      xrayWallsMode: false,
      undergroundViewMode: false,
      thermalHeatmapMode: false,
      dayOfYear: 172,
      hourOfDay: 13.8,
      selectedObjectCategory: 'house',
      showDrainageZones: false
    },
    visualFocus: 'drag_and_drop_placement'
  },
  {
    id: 'scene-03-edit-dimensions-floors-roof-windows',
    index: 3,
    startSec: 16,
    durationSec: 8,
    endSec: 24,
    kicker: 'СЦЕНА 03 · РЕДАКТИРОВАНИЕ ГАБАРИТОВ, ЭТАЖНОСТИ, КРЫШИ И ОКОН',
    headline: 'Настройка размеров дома, 1–3 этажей + подвала, формы крыши и окон',
    subheadline: 'Мгновенная перестройка 3D-архитектуры: габариты W×L, типы кровли и размещение окон по фасадам',
    whatHappensOnScreen:
      'В инспекторе динамически меняются ширина и длина дома, переключается этажность (1, 2, 3 этажа + подземный этаж), форма крыши (плоская, односкатная, двускатная, вальмовая), а также количество, размер и смещение окон и дверей по каждому фасаду.',
    whyItIsDone:
      'Дает полный архитектурный контроль над проектом дома: вы сразу видите чистую площадь внутри стен по всем этажам, высоту конька, внешний вид фасадов и точное расположение каждого оконного и дверного проема.',
    normativeCode: 'СП 55.13330.2016 · 1–3 этажа + Подвал · 4 формы крыши',
    appAction: {
      viewMode: '3d',
      showForbiddenZones: false,
      xrayWallsMode: false,
      undergroundViewMode: false,
      thermalHeatmapMode: false,
      dayOfYear: 172,
      hourOfDay: 14.2,
      selectedObjectCategory: 'house',
      showDrainageZones: false
    },
    visualFocus: 'edit_dimensions_floors_roof_windows'
  },
  {
    id: 'scene-04-normative-setbacks',
    index: 4,
    startSec: 24,
    durationSec: 8,
    endSec: 32,
    kicker: 'СЦЕНА 04 · АВТОМАТИЧЕСКИЙ АУДИТ ОТСТУПОВ И ПОЖАРНЫХ РАЗРЫВОВ',
    headline: 'Мгновенная проверка СП 53.13330.2019 и «ловушки свеса крыши»',
    subheadline: 'Красные зоны отступов внутри и за пределами участка + противопожарные радиусы 6–15 м',
    whatHappensOnScreen:
      'На 2D-чертеже генплана строятся нормативные отступы: 5 м от красной линии улицы, 3 м от проезда и межи для дома, 1 м для бани и хозпостроек, 15 м от леса и 20 м от водоема. При свесе крыши более 500 мм отступ автоматически считается от проекции кровли.',
    whyItIsDone:
      'Защищает собственника от отказа в регистрации дома в Росреестре и от судебных исков о сносе самовольной постройки из-за нарушения градостроительных, санитарных и пожарных норм РФ.',
    normativeCode: 'СП 53.13330.2019 п. 6.7 · СП 4.13130.2013',
    appAction: {
      viewMode: '2d',
      showForbiddenZones: true,
      xrayWallsMode: false,
      undergroundViewMode: false,
      thermalHeatmapMode: false,
      dayOfYear: 172,
      hourOfDay: 14.0,
      selectedObjectCategory: 'house',
      showDrainageZones: true
    },
    visualFocus: 'normative_setbacks_2d'
  },
  {
    id: 'scene-05-sun-insolation',
    index: 5,
    startSec: 32,
    durationSec: 8,
    endSec: 40,
    kicker: 'СЦЕНА 05 · ХОД СОЛНЦА, СВЕТОВОЕ ПЯТНО В ДОМЕ И САНПИН',
    headline: 'Рентген стен и траектория солнечных лучей сквозь окна и двери',
    subheadline: 'Автоматический расчет непрерывной инсоляции фасадов по СанПиН 1.2.3685-21',
    whatHappensOnScreen:
      'Стены здания становятся полупрозрачными, а солнце движется по астрономической траектории (весна, лето, осень, зима). На полу этажей в реальном времени отображается движение световых пятен от окон и остекленных дверей.',
    whyItIsDone:
      'Помогает правильно развернуть дом по сторонам света и разместить окна так, чтобы в жилых комнатах выполнялась норма СанПиН (от 1.5 до 2.5 часов непрерывного солнца), а дом соседа не погружал окна в вечную тень.',
    normativeCode: 'СанПиН 1.2.3685-21 · ГОСТ Р 57795-2017',
    appAction: {
      viewMode: '3d',
      showForbiddenZones: false,
      xrayWallsMode: true,
      undergroundViewMode: false,
      thermalHeatmapMode: false,
      dayOfYear: 172,
      hourOfDay: 15.2,
      selectedObjectCategory: 'house',
      showDrainageZones: false
    },
    visualFocus: 'sun_insolation_xray'
  },
  {
    id: 'scene-06-roof-snow-wind-foundation',
    index: 6,
    startSec: 40,
    durationSec: 8,
    endSec: 48,
    kicker: 'СЦЕНА 06 · РОЗА ВЕТРОВ, СНЕГОВАЯ И ВЕТРОВАЯ НАГРУЗКА НА ДОМ И ЗАБОРЫ',
    headline: 'Региональная роза ветров, парусность заборов, снег и фундамент',
    subheadline: 'Расчет ветрового давления w₀, изгибающего момента на столбы забора, массы снега и грунта',
    whatHappensOnScreen:
      'По региону РФ строится 8-румбовая роза ветров, вычисляется ветровая нагрузка на фасады и кровлю дома, парусность глухих и сетчатых заборов (момент на столб в кН·м), а также снеговая нагрузка от угла ската крыши α° и давление фундамента на грунт.',
    whyItIsDone:
      'Предотвращает крен и вырывание столбов забора штормовым ветром, отрыв свесов кровли, прогиб стропильной системы зимой и просадку фундамента на пучинистых суглинках или торфяниках.',
    normativeCode: 'СП 20.13330.2016 Раздел 10 и 11 · СП 22.13330.2016',
    appAction: {
      viewMode: '3d',
      showForbiddenZones: true,
      xrayWallsMode: false,
      undergroundViewMode: false,
      thermalHeatmapMode: false,
      dayOfYear: 355,
      hourOfDay: 12.5,
      selectedObjectCategory: 'house',
      showDrainageZones: false
    },
    visualFocus: 'roof_snow_foundation'
  },
  {
    id: 'scene-07-thermal-heatmap',
    index: 7,
    startSec: 48,
    durationSec: 8,
    endSec: 56,
    kicker: 'СЦЕНА 07 · 3D ТЕПЛОВИЗОР ФАСАДОВ И СТОИМОСТЬ ОТОПЛЕНИЯ',
    headline: 'Тепловая карта потерь энергии, выбор стеклопакетов и утепления',
    subheadline: 'Честный вычет площади окон из стен и расчет затрат на газ, электричество и дрова',
    whatHappensOnScreen:
      'В 3D-вьюпорте включается режим тепловизора фасадов. Программа сравнивает деревянные окна (1–2 стекла) и ПВХ-профиль (1–2 камеры), утепление стен и кровли (минвата, эковата, PIR), присваивая дому класс энергоэффективности A++…E.',
    whyItIsDone:
      'Показывает зоны повышенных теплопотерь и мостики холода до покупки материалов, позволяя сократить ежегодные счета за отопление дома на 35–55% в условиях русской зимы.',
    normativeCode: 'СП 50.13330.2012 «Тепловая защита зданий»',
    appAction: {
      viewMode: '3d',
      showForbiddenZones: false,
      xrayWallsMode: false,
      undergroundViewMode: false,
      thermalHeatmapMode: true,
      dayOfYear: 355,
      hourOfDay: 14.0,
      selectedObjectCategory: 'house',
      showDrainageZones: false
    },
    visualFocus: 'thermal_heatmap_energy'
  },
  {
    id: 'scene-08-relief-drainage-utilities',
    index: 8,
    startSec: 56,
    durationSec: 8,
    endSec: 64,
    kicker: 'СЦЕНА 08 · РЕЛЬЕФ УЧАСТКА, ДРЕНАЖ И ПОДЗЕМНЫЙ 3D-РАЗРЕЗ',
    headline: 'Подземный этаж дома, трассы водопровода и ливневое водоотведение',
    subheadline: 'Прозрачный грунт: контроль цокольного этажа и глубины заложения труб ниже промерзания',
    whatHappensOnScreen:
      'Включается подземный 3D-режим: поверхность грунта становится полупрозрачной, открывая подземный этаж дома с лестницей и перегородками, а также подземные трассы водопровода, канализации и газа (Ø 32–315 мм) относительно плоскости промерзания грунта.',
    whyItIsDone:
      'Защищает участок от весеннего затопления талыми водами и гарантирует, что подземный этаж и магистральный водопровод залегают на безопасной глубине и не перемерзнут зимой.',
    normativeCode: 'СП 42.13330.2016 · СП 32.13330.2018 · СП 31.13330',
    appAction: {
      viewMode: '3d',
      showForbiddenZones: true,
      xrayWallsMode: false,
      undergroundViewMode: true,
      thermalHeatmapMode: false,
      dayOfYear: 105,
      hourOfDay: 13.0,
      selectedObjectCategory: 'house',
      showDrainageZones: true
    },
    visualFocus: 'relief_drainage_underground'
  },
  {
    id: 'scene-09-legal-protection',
    index: 9,
    startSec: 64,
    durationSec: 8,
    endSec: 72,
    kicker: 'СЦЕНА 09 · ЮРИДИЧЕСКАЯ ЗАЩИТА СОБСТВЕННИКА ПО ЗАКОНАМ РФ',
    headline: 'Генератор досудебной претензии соседу и бланка согласия на забор',
    subheadline: 'Автоматический документ со ссылками на ст. 304 ГК РФ и точными замерами нарушений',
    whatHappensOnScreen:
      'Программа фиксирует нарушения со стороны соседского участка (дом ближе 3 м, скат крыши на вашу территорию, глухой забор > 1.8 м в СНТ) и автоматически формирует юридическое «Требование об устранении нарушений» или «Согласие соседа».',
    whyItIsDone:
      'Экономит десятки тысяч рублей на юристах и землеустроительных экспертизах: вы сразу получаете аргументированный правовой документ для мирного урегулирования спора или обращения в суд.',
    normativeCode: 'ст. 304 ГК РФ · ст. 222 ГК РФ · СП 53.13330.2019',
    appAction: {
      viewMode: '3d',
      showForbiddenZones: true,
      xrayWallsMode: false,
      undergroundViewMode: false,
      thermalHeatmapMode: false,
      dayOfYear: 172,
      hourOfDay: 14.5,
      selectedObjectCategory: 'neighbor_house',
      showDrainageZones: true
    },
    visualFocus: 'legal_claim_defense'
  },
  {
    id: 'scene-10-bom-pdf-mcp',
    index: 10,
    startSec: 72,
    durationSec: 8,
    endSec: 80,
    kicker: 'СЦЕНА 10 · СМЕТА ПО РЫНОЧНЫМ ЦЕНАМ, ОТЧЕТ PDF И ИИ-ИНТЕГРАЦИЯ MCP',
    headline: 'Точная ведомость материалов, полный PDF-отчет и управление через ИИ',
    subheadline: 'Ввод рыночных цен за кубометр/м², экспорт PDF в 1 клик и встроенный MCP-сервер',
    whatHappensOnScreen:
      'Рассчитывается объем бетона, арматуры, стеновых блоков, бруса, кровли и забора с подстановкой ваших рыночных цен за единицу материала. Готовый градостроительный отчет выгружается в многостраничный PDF, а MCP-сервер открывает API для нейросетей.',
    whyItIsDone:
      'Защищает от завышения смет строительными бригадами и собирает всю проектную, инженерную и правовую документацию по участку в один официальный PDF-файл.',
    normativeCode: 'PDF-Отчет (%PDF-1.4) · Смета BOM · MCP JSON-RPC 2.0',
    appAction: {
      viewMode: '3d',
      showForbiddenZones: true,
      xrayWallsMode: false,
      undergroundViewMode: false,
      thermalHeatmapMode: false,
      dayOfYear: 172,
      hourOfDay: 14.5,
      selectedObjectCategory: 'house',
      showDrainageZones: true
    },
    visualFocus: 'bom_market_pdf_mcp'
  }
];

/**
 * Returns the active scene and local progress (0..1) for any timestamp in the promotional video.
 */
export function getPromoSceneAtTime(elapsedSec: number): {
  scene: PromoVideoScene;
  sceneLocalProgress01: number;
  overallProgress01: number;
  clampedTimeSec: number;
} {
  const clamped = Math.max(0, Math.min(PROMO_VIDEO_TOTAL_DURATION_SEC - 0.001, elapsedSec));
  const found =
    PROMO_VIDEO_SCENES.find((s) => clamped >= s.startSec && clamped < s.endSec) ||
    PROMO_VIDEO_SCENES[PROMO_VIDEO_SCENES.length - 1];
  const localProg = Math.max(0, Math.min(1, (clamped - found.startSec) / found.durationSec));
  const overallProg = Math.max(0, Math.min(1, clamped / PROMO_VIDEO_TOTAL_DURATION_SEC));
  return {
    scene: found,
    sceneLocalProgress01: localProg,
    overallProgress01: overallProg,
    clampedTimeSec: clamped
  };
}

/**
 * Computes real project metrics for the active promotional scene so the video overlays
 * display authentic numbers from the user's actual plot and buildings.
 */
export function computeLivePromoSceneMetrics(
  scene: PromoVideoScene,
  plot: PlotConfig,
  objects: SiteObject[],
  violationsCount: number
): PromoSceneMetricPill[] {
  const region = getEffectivePlotRegion(plot);
  const house = objects.find((o) => o.category === 'house') || objects[0];
  const interior = house ? calculateBuildingInteriorArea(house) : null;
  const snow = house ? calculateSnowLoad(house, region.id) : null;
  const fnd = house ? calculateFoundationBearing(house, region.id, plot.soilTypeId) : null;
  const energy = house ? calculateEnergyAndHeating(house, plot) : null;
  const relief = calculatePlotReliefAndDrainage(plot, objects);
  const wind = calculateWindRoseAndLoads(plot, objects, house);
  const bom = calculateBillOfMaterials(plot, objects);

  switch (scene.visualFocus) {
    case 'site_3d_precision':
      return [
        {
          label: 'Участок',
          value: `${plot.width}×${plot.length} м (${((plot.width * plot.length) / 100).toFixed(1)} сот.)`,
          accent: 'sky'
        },
        {
          label: 'Чистая S дома',
          value: interior ? `${interior.totalNetInteriorAllFloorsSqm} м²` : '150.9 м²',
          accent: 'emerald'
        },
        {
          label: 'Точность ввода',
          value: '1 мм (0.001 м)',
          accent: 'indigo'
        }
      ];
    case 'drag_and_drop_placement':
      return [
        {
          label: 'Режим размещения',
          value: 'Drag & Drop (Мышь / Сетка)',
          accent: 'sky'
        },
        {
          label: 'Построек на схеме',
          value: `${objects.length} объектов`,
          accent: 'emerald'
        },
        {
          label: 'Контроль дистанций',
          value: 'В реальном времени',
          accent: 'amber'
        }
      ];
    case 'edit_dimensions_floors_roof_windows':
      return [
        {
          label: 'Габариты и этажи',
          value: house ? `${house.width}×${house.length} м · ${house.floors || 2} эт. + подвал` : '10×10 м · 2 эт.',
          accent: 'sky'
        },
        {
          label: 'Форма крыши',
          value: '4 типа (Плоская/Скатная/Вальма)',
          accent: 'amber'
        },
        {
          label: 'Окна и двери',
          value: 'По 4 фасадам + смещение',
          accent: 'emerald'
        }
      ];
    case 'normative_setbacks_2d':
      return [
        {
          label: 'Отступ от улицы / межи',
          value: '5.0 м / 3.0 м',
          accent: 'sky'
        },
        {
          label: 'Пожарный разрыв',
          value: '6–15 м (СП 4.13130)',
          accent: 'amber'
        },
        {
          label: 'Выявлено нарушений',
          value: `${violationsCount} шт.`,
          accent: violationsCount > 0 ? 'rose' : 'emerald'
        }
      ];
    case 'sun_insolation_xray':
      return [
        {
          label: 'Норма СанПиН',
          value: '≥ 2.0 ч непрерывно',
          accent: 'amber'
        },
        {
          label: 'Широта участка',
          value: `${(plot.customLat ?? region.lat).toFixed(2)}° с.ш.`,
          accent: 'sky'
        },
        {
          label: 'Режим стен',
          value: 'Рентген + Световое пятно',
          accent: 'emerald'
        }
      ];
    case 'roof_snow_foundation':
      return [
        {
          label: `Ветер (${wind.windZone} р-н, ${wind.prevailingWindDir})`,
          value: `w₀=${wind.windPressureW0KgM2} кг/м² · F=${wind.selectedBuildingWind.totalHorizontalForceKn} кН`,
          accent: 'sky'
        },
        {
          label: 'Парусность забора',
          value: `M = ${wind.maxFenceMomentKnm} кН·м на столб`,
          accent: 'amber'
        },
        {
          label: 'Снег S0 и грунт R0',
          value: snow && fnd ? `${snow.designSnowLoadS} кг/м² · ${fnd.actualPressureKpa} кПа` : '210 кг/м² · 81 кПа',
          accent: 'emerald'
        }
      ];
    case 'thermal_heatmap_energy':
      return [
        {
          label: 'Класс энергоэффект.',
          value: energy ? `Класс ${energy.energyClass} (${energy.energyClassLabel})` : 'Класс B+',
          accent: 'emerald'
        },
        {
          label: 'Теплопотери за сезон',
          value: energy ? `${energy.totalAnnualHeatEnergyKwh.toLocaleString('ru-RU')} кВт·ч` : '11 400 кВт·ч',
          accent: 'amber'
        },
        {
          label: 'Отопление газом',
          value: energy ? `${energy.gas.annualCostRub.toLocaleString('ru-RU')} ₽/год` : '12 800 ₽/год',
          accent: 'sky'
        }
      ];
    case 'relief_drainage_underground':
      return [
        {
          label: 'Уклон рельефа i',
          value: `${relief.slopePercent}% (${relief.slopePermille}‰, ΔH=${relief.elevationDeltaM}м)`,
          accent: 'sky'
        },
        {
          label: 'Подземный этаж и трубы',
          value: `Подвал −2.4 м · Вода −1.8 м`,
          accent: 'emerald'
        },
        {
          label: 'Промерзание грунта',
          value: `−${region.frostDepth} м (СП 31.13330)`,
          accent: 'indigo'
        }
      ];
    case 'legal_claim_defense':
      return [
        {
          label: 'Правовое основание',
          value: 'ст. 304 ГК РФ (Негаторный иск)',
          accent: 'rose'
        },
        {
          label: 'Виды документов',
          value: 'Требование / Претензия / Согласие',
          accent: 'amber'
        },
        {
          label: 'Готовность к печати',
          value: '100% с замерами в м',
          accent: 'emerald'
        }
      ];
    case 'bom_market_pdf_mcp':
    default:
      return [
        {
          label: 'Итоговая смета BOM',
          value: `${bom.totalEstimatedCostRub.toLocaleString('ru-RU')} ₽`,
          accent: 'emerald'
        },
        {
          label: 'Градостроительный отчет',
          value: 'Многостраничный PDF',
          accent: 'indigo'
        },
        {
          label: 'ИИ-мост нейросетей',
          value: 'MCP JSON-RPC 2.0',
          accent: 'sky'
        }
      ];
  }
}
