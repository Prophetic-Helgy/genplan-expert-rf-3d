import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PlotConfig, SiteObject, BuildingCategory } from './src/types/index.ts';
import {
  validateSitePlan,
  calculateSnowLoad,
  calculateFoundationBearing,
  calculateBillOfMaterials,
  getObjectWindowsConfig
} from './src/utils/calculations.ts';
import { BUILDING_CATEGORY_LABELS } from './src/data/regions.ts';

const __dirname = import.meta.dirname;

// In-memory authoritative state for MCP Server synchronized with browser client
interface MCPServerState {
  plot: PlotConfig;
  objects: SiteObject[];
  updatedAt: string;
}

const DEFAULT_PLOT: PlotConfig = {
  preset: 'rectangle',
  width: 28,
  length: 36,
  trapezoidTopWidth: 20,
  lCutoutWidth: 10,
  lCutoutLength: 12,
  points: [],
  edges: [
    { edgeIndex: 0, type: 'street', fenceType: 'solid', fenceHeight: 2.0, hasNeighborConsent: false },
    { edgeIndex: 1, type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false },
    { edgeIndex: 2, type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false },
    { edgeIndex: 3, type: 'driveway', fenceType: 'solid', fenceHeight: 1.8, hasNeighborConsent: false }
  ],
  category: 'SNT',
  northAngle: 0,
  regionId: 'moscow',
  soilTypeId: 'loam',
  hasZouit: false,
  zouitEdgeIndex: 0,
  zouitDepth: 5
};

const DEFAULT_OBJECTS: SiteObject[] = [
  {
    id: 'house-main',
    name: 'Жилой дом',
    category: 'house',
    x: -2,
    z: 3,
    width: 9,
    length: 10,
    wallHeight: 3.2,
    roofHeight: 2.6,
    overhang: 0.45,
    rotation: 0,
    roofType: 'gable',
    footprintShape: 'rectangle',
    windows: { south: 2, north: 1, east: 1, west: 1, windowWidth: 1.4, windowHeight: 1.4, sillHeight: 0.9, positionOffset: 0 },
    slopeDirection: 'south',
    material: 'stone',
    floors: 2,
    glazingRatio: 0.15,
    partitionLength: 26,
    wallMaterialId: 'aerated_concrete',
    roofCoverId: 'metal_tile',
    foundationTypeId: 'deep_strip'
  },
  {
    id: 'bath-1',
    name: 'Баня / Сауна',
    category: 'bathhouse',
    x: 8.5,
    z: -12,
    width: 5,
    length: 6,
    wallHeight: 2.7,
    roofHeight: 1.6,
    overhang: 0.35,
    rotation: 0,
    roofType: 'shed',
    footprintShape: 'rectangle',
    windows: { south: 1, north: 0, east: 1, west: 0, windowWidth: 1.4, windowHeight: 1.4, sillHeight: 0.9, positionOffset: 0 },
    slopeDirection: 'west',
    material: 'wood',
    floors: 1,
    glazingRatio: 0.1,
    partitionLength: 6,
    wallMaterialId: 'timber',
    roofCoverId: 'metal_tile',
    foundationTypeId: 'mzlf'
  },
  {
    id: 'well-1',
    name: 'Скважина',
    category: 'well',
    x: -9,
    z: -11,
    width: 1.6,
    length: 1.6,
    wallHeight: 1.2,
    roofHeight: 0.6,
    overhang: 0.2,
    rotation: 0,
    roofType: 'gable',
    footprintShape: 'rectangle',
    windows: { south: 0, north: 0, east: 0, west: 0, windowWidth: 1.4, windowHeight: 1.4, sillHeight: 0.9, positionOffset: 0 },
    slopeDirection: 'south',
    material: 'stone',
    floors: 1,
    glazingRatio: 0,
    partitionLength: 0,
    wallMaterialId: 'aerated_concrete',
    roofCoverId: 'metal_tile',
    foundationTypeId: 'mzlf'
  },
  {
    id: 'septic-1',
    name: 'Септик',
    category: 'toilet',
    x: 10,
    z: 11.5,
    width: 2.2,
    length: 2.2,
    wallHeight: 2.2,
    roofHeight: 0.4,
    overhang: 0.2,
    rotation: 0,
    roofType: 'flat',
    footprintShape: 'rectangle',
    windows: { south: 0, north: 0, east: 0, west: 0, windowWidth: 1.4, windowHeight: 1.4, sillHeight: 0.9, positionOffset: 0 },
    slopeDirection: 'south',
    material: 'stone',
    floors: 1,
    glazingRatio: 0,
    partitionLength: 0,
    wallMaterialId: 'aerated_concrete',
    roofCoverId: 'corrugated',
    foundationTypeId: 'slab'
  },
  {
    id: 'neighbor-house-east',
    name: 'Дом соседа',
    category: 'neighbor_house',
    x: 19.5,
    z: 2,
    width: 8,
    length: 9,
    wallHeight: 3.2,
    roofHeight: 2.4,
    overhang: 0.4,
    rotation: 0,
    roofType: 'hip',
    footprintShape: 'rectangle',
    windows: { south: 2, north: 1, east: 1, west: 1, windowWidth: 1.4, windowHeight: 1.4, sillHeight: 0.9, positionOffset: 0 },
    slopeDirection: 'south',
    material: 'wood',
    floors: 1.5,
    glazingRatio: 0.15,
    partitionLength: 14,
    wallMaterialId: 'timber',
    roofCoverId: 'metal_tile',
    foundationTypeId: 'mzlf'
  }
];

let mcpState: MCPServerState = {
  plot: DEFAULT_PLOT,
  objects: DEFAULT_OBJECTS,
  updatedAt: new Date().toISOString()
};

const MCP_TOOLS_DEFINITION = [
  {
    name: 'get_site_plan',
    description:
      'Возвращает текущую конфигурацию земельного участка, список всех построек/природных объектов/сетей и список активных нарушений СП/СНиП РФ.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'update_plot_config',
    description:
      'Обновляет параметры участка (width, length, category: IZhS|SNT, northAngle, regionId, soilTypeId, preset).',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Ширина участка по оси З-В (м)' },
        length: { type: 'number', description: 'Длина участка по оси С-Ю (м)' },
        category: { type: 'string', enum: ['IZHS', 'SNT'], description: 'Категория земель' },
        northAngle: { type: 'number', description: 'Поворот севера в градусах (0..360)' },
        regionId: { type: 'string', description: 'ID климатического региона РФ (например moscow, spb, ekb, sochi)' }
      }
    }
  },
  {
    name: 'add_site_object',
    description:
      'Добавляет на план новую постройку, дерево, лес, водоем, ЛЭП, газопровод, водопровод, канализацию или дорогу.',
    inputSchema: {
      type: 'object',
      required: ['category'],
      properties: {
        category: {
          type: 'string',
          enum: [
            'house',
            'bathhouse',
            'garage',
            'shed',
            'greenhouse',
            'poultry',
            'toilet',
            'well',
            'neighbor_house',
            'neighbor_well',
            'forest',
            'tree_tall',
            'tree_medium',
            'water_body',
            'power_line',
            'gas_pipe',
            'water_main',
            'sewer_main',
            'road'
          ]
        },
        name: { type: 'string', description: 'Название объекта на генплане' },
        x: { type: 'number', description: 'Координата X от центра участка (м)' },
        z: { type: 'number', description: 'Координата Z от центра участка (м)' },
        width: { type: 'number', description: 'Ширина объекта (м)' },
        length: { type: 'number', description: 'Длина объекта (м)' },
        roofType: { type: 'string', enum: ['flat', 'shed', 'gable', 'hip'] },
        slopeDirection: { type: 'string', enum: ['north', 'south', 'east', 'west'] }
      }
    }
  },
  {
    name: 'update_site_object',
    description:
      'Изменяет параметры существующего объекта по его id (имя, координаты, габариты, форму, крышу, направление ската, параметры окон).',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        x: { type: 'number' },
        z: { type: 'number' },
        width: { type: 'number' },
        length: { type: 'number' },
        wallHeight: { type: 'number' },
        roofHeight: { type: 'number' },
        rotation: { type: 'number', description: 'Угол поворота объекта в градусах (0..360)' },
        roofType: { type: 'string', enum: ['flat', 'shed', 'gable', 'hip'] },
        slopeDirection: { type: 'string', enum: ['north', 'south', 'east', 'west'] },
        windows: {
          type: 'object',
          properties: {
            south: { type: 'number' },
            north: { type: 'number' },
            east: { type: 'number' },
            west: { type: 'number' },
            windowWidth: { type: 'number' },
            windowHeight: { type: 'number' },
            sillHeight: { type: 'number' },
            positionOffset: { type: 'number' }
          }
        }
      }
    }
  },
  {
    name: 'remove_site_object',
    description: 'Удаляет объект с участка по его id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' }
      }
    }
  },
  {
    name: 'validate_sp_regulations',
    description:
      'Выполняет полную нормативную проверку генплана по СП 53.13330.2019, СП 42.13330.2016, СП 4.13130.2013, ВК РФ ст. 65, ПП РФ №160 и №878.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'calculate_engineering_and_bom',
    description:
      'Рассчитывает снеговую нагрузку (СП 20.13330.2016), рекомендации по фундаменту и полную смету материалов (BOM) для выбранной постройки.',
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string', description: 'ID постройки (если не указан — первая капитальная постройка)' }
      }
    }
  }
];

function executeMcpToolCall(name: string, args: Record<string, unknown> = {}) {
  switch (name) {
    case 'get_site_plan': {
      const violations = validateSitePlan(mcpState.plot, mcpState.objects, 0);
      return {
        plot: mcpState.plot,
        objects: mcpState.objects,
        violations,
        updatedAt: mcpState.updatedAt
      };
    }
    case 'update_plot_config': {
      mcpState.plot = {
        ...mcpState.plot,
        ...(typeof args.width === 'number' ? { width: args.width } : {}),
        ...(typeof args.length === 'number' ? { length: args.length } : {}),
        ...(args.category === 'IZHS' || args.category === 'SNT' ? { category: args.category } : {}),
        ...(typeof args.northAngle === 'number' ? { northAngle: args.northAngle } : {}),
        ...(typeof args.regionId === 'string' ? { regionId: args.regionId } : {})
      };
      mcpState.updatedAt = new Date().toISOString();
      const violations = validateSitePlan(mcpState.plot, mcpState.objects, 0);
      return { plot: mcpState.plot, violationsCount: violations.length, violations };
    }
    case 'add_site_object': {
      const category = (args.category as BuildingCategory) || 'house';
      const meta = BUILDING_CATEGORY_LABELS[category] || BUILDING_CATEGORY_LABELS.house;
      const id = `${category}-${Date.now().toString().slice(-4)}`;
      const newObj: SiteObject = {
        id,
        name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : `${meta.shortLabel} #${mcpState.objects.length + 1}`,
        category,
        x: typeof args.x === 'number' ? args.x : 0,
        z: typeof args.z === 'number' ? args.z : 0,
        width: typeof args.width === 'number' ? args.width : 6,
        length: typeof args.length === 'number' ? args.length : 6,
        wallHeight: typeof args.wallHeight === 'number' ? args.wallHeight : 3.0,
        roofHeight: typeof args.roofHeight === 'number' ? args.roofHeight : 2.0,
        overhang: 0.4,
        rotation: typeof args.rotation === 'number' ? args.rotation : 0,
        roofType: (args.roofType as SiteObject['roofType']) || 'gable',
        footprintShape: 'rectangle',
        windows: {
          south: 1,
          north: 0,
          east: 1,
          west: 0,
          windowWidth: 1.4,
          windowHeight: 1.4,
          sillHeight: 0.9,
          positionOffset: 0
        },
        slopeDirection: (args.slopeDirection as SiteObject['slopeDirection']) || 'south',
        material: category === 'house' || category === 'garage' ? 'stone' : 'wood',
        floors: category === 'house' ? 2 : 1,
        glazingRatio: 0.15,
        partitionLength: 10,
        wallMaterialId: 'aerated_concrete',
        roofCoverId: 'metal_tile',
        foundationTypeId: 'mzlf'
      };
      mcpState.objects = [...mcpState.objects, newObj];
      mcpState.updatedAt = new Date().toISOString();
      const violations = validateSitePlan(mcpState.plot, mcpState.objects, 0);
      return { addedObject: newObj, totalObjects: mcpState.objects.length, violations };
    }
    case 'update_site_object': {
      const id = String(args.id || '');
      const idx = mcpState.objects.findIndex((o) => o.id === id);
      if (idx === -1) {
        throw new Error(`Объект с id="${id}" не найден на участке.`);
      }
      const prev = mcpState.objects[idx];
      const nextWindows =
        args.windows && typeof args.windows === 'object'
          ? { ...getObjectWindowsConfig(prev), ...(args.windows as Partial<SiteObject['windows']>) }
          : getObjectWindowsConfig(prev);
      const updated: SiteObject = {
        ...prev,
        ...(typeof args.name === 'string' ? { name: args.name } : {}),
        ...(typeof args.x === 'number' ? { x: args.x } : {}),
        ...(typeof args.z === 'number' ? { z: args.z } : {}),
        ...(typeof args.width === 'number' ? { width: args.width } : {}),
        ...(typeof args.length === 'number' ? { length: args.length } : {}),
        ...(typeof args.wallHeight === 'number' ? { wallHeight: args.wallHeight } : {}),
        ...(typeof args.roofHeight === 'number' ? { roofHeight: args.roofHeight } : {}),
        ...(typeof args.rotation === 'number' ? { rotation: ((args.rotation % 360) + 360) % 360 } : {}),
        ...(typeof args.roofType === 'string' ? { roofType: args.roofType as SiteObject['roofType'] } : {}),
        ...(typeof args.slopeDirection === 'string'
          ? { slopeDirection: args.slopeDirection as SiteObject['slopeDirection'] }
          : {}),
        windows: nextWindows
      };
      mcpState.objects = mcpState.objects.map((o) => (o.id === id ? updated : o));
      mcpState.updatedAt = new Date().toISOString();
      const violations = validateSitePlan(mcpState.plot, mcpState.objects, 0);
      return { updatedObject: updated, violations };
    }
    case 'remove_site_object': {
      const id = String(args.id || '');
      const before = mcpState.objects.length;
      mcpState.objects = mcpState.objects.filter((o) => o.id !== id);
      mcpState.updatedAt = new Date().toISOString();
      return { removedId: id, removed: mcpState.objects.length < before, remainingObjects: mcpState.objects.length };
    }
    case 'validate_sp_regulations': {
      const violations = validateSitePlan(mcpState.plot, mcpState.objects, 0);
      return {
        compliant: violations.filter((v) => v.severity === 'error').length === 0,
        errorCount: violations.filter((v) => v.severity === 'error').length,
        warningCount: violations.filter((v) => v.severity === 'warning').length,
        violations
      };
    }
    case 'calculate_engineering_and_bom': {
      const targetId = typeof args.objectId === 'string' ? args.objectId : mcpState.objects[0]?.id;
      const obj = mcpState.objects.find((o) => o.id === targetId) || mcpState.objects[0];
      if (!obj) {
        throw new Error('На участке нет объектов для инженерного расчета.');
      }
      const snowLoad = calculateSnowLoad(obj, mcpState.plot.regionId);
      const foundation = calculateFoundationBearing(obj, mcpState.plot.regionId, mcpState.plot.soilTypeId);
      const bom = calculateBillOfMaterials(mcpState.plot, mcpState.objects);
      return { object: obj.name, snowLoad, foundation, bom };
    }
    default:
      throw new Error(`Неизвестный инструмент MCP: ${name}`);
  }
}

function handleJsonRpcRequest(body: Record<string, unknown>) {
  const id = (body.id as number | string | undefined) ?? 1;
  const method = String(body.method || '');
  const params = (body.params as Record<string, unknown>) || {};

  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'genplan-expert-rf-3d-mcp',
            version: '2.0.0'
          },
          capabilities: {
            tools: { listChanged: true }
          }
        }
      };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: MCP_TOOLS_DEFINITION
        }
      };
    }

    if (method === 'tools/call') {
      const toolName = String(params.name || '');
      const toolArgs = (params.arguments as Record<string, unknown>) || {};
      const toolOutput = executeMcpToolCall(toolName, toolArgs);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(toolOutput, null, 2)
            }
          ],
          data: toolOutput,
          state: mcpState
        }
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Метод "${method}" не поддерживается. Используйте initialize, tools/list или tools/call.`
      }
    };
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : 'Внутренняя ошибка MCP-сервера'
      }
    };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // MCP Discovery Manifest
  app.get('/api/mcp/manifest', (_req, res) => {
    res.json({
      name: 'genplan-expert-rf-3d-mcp',
      version: '2.0.0',
      protocol: 'Model Context Protocol (JSON-RPC 2.0)',
      endpoints: {
        jsonrpc: '/mcp',
        apiRpc: '/api/mcp/rpc',
        state: '/api/mcp/state'
      },
      tools: MCP_TOOLS_DEFINITION
    });
  });

  // Synchronize state between browser client and server MCP instance
  app.get('/api/mcp/state', (_req, res) => {
    res.json(mcpState);
  });

  app.post('/api/mcp/state', (req, res) => {
    if (req.body && req.body.plot && Array.isArray(req.body.objects)) {
      mcpState = {
        plot: req.body.plot,
        objects: req.body.objects,
        updatedAt: new Date().toISOString()
      };
    }
    res.json({ ok: true, updatedAt: mcpState.updatedAt });
  });

  // Standard MCP JSON-RPC 2.0 endpoints
  app.post('/mcp', (req, res) => {
    const response = handleJsonRpcRequest(req.body || {});
    res.json(response);
  });

  app.post('/api/mcp/rpc', (req, res) => {
    const response = handleJsonRpcRequest(req.body || {});
    res.json(response);
  });

  const isProduction =
    process.env.NODE_ENV === 'production' || process.argv.includes('--production');

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`GenPlan-Expert RF 3D + MCP Server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
