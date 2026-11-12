import React, { useState } from 'react';
import { X, Terminal, Copy, Check, Play, Cpu, Server, ShieldCheck } from 'lucide-react';
import { PlotConfig, SiteObject, NormViolation } from '../types';

export interface MCPToolCallResult {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface MCPServerModalProps {
  isOpen: boolean;
  plot: PlotConfig;
  objects: SiteObject[];
  violations: NormViolation[];
  onClose: () => void;
  onExecuteMcpRpc: (rpcPayload: Record<string, unknown>) => Promise<MCPToolCallResult>;
}

const SAMPLE_RPC_PRESETS: Array<{ label: string; description: string; payload: Record<string, unknown> }> = [
  {
    label: 'tools/list (Список инструментов MCP)',
    description: 'Запрос всех доступных инструментов управления генпланом для ИИ-агента',
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    }
  },
  {
    label: 'validate_sp_regulations (Аудит СНиП/СП РФ)',
    description: 'Проверка всех отступов, противопожарных разрывов, охранных зон ЛЭП/газа/леса/воды и уклонов крыш',
    payload: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'validate_sp_regulations',
        arguments: {}
      }
    }
  },
  {
    label: 'add_site_object (Добавить Гостевой дом)',
    description: 'Добавление новой постройки на участок через нейросетевой протокол MCP',
    payload: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'add_site_object',
        arguments: {
          category: 'house',
          name: 'Гостевой дом (ИИ)',
          x: -5,
          z: -6,
          width: 6,
          length: 7,
          roofType: 'gable',
          slopeDirection: 'south'
        }
      }
    }
  },
  {
    label: 'add_site_object (Добавить ЛЭП / Газопровод)',
    description: 'Добавление линейного объекта инфраструктуры с охранной зоной ЗОУИТ',
    payload: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'add_site_object',
        arguments: {
          category: 'gas_pipe',
          name: 'Магистральный газопровод ВД',
          x: 0,
          z: 20,
          width: 28,
          length: 1.5
        }
      }
    }
  },
  {
    label: 'update_site_object (Переименовать и настроить окна)',
    description: 'Изменение имени, размеров и параметров окон объекта на участке по ID',
    payload: {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'update_site_object',
        arguments: {
          id: 'house-main',
          name: 'Главный коттедж',
          windows: {
            south: 3,
            north: 1,
            east: 2,
            west: 1,
            windowWidth: 1.8,
            windowHeight: 1.6,
            sillHeight: 0.85,
            positionOffset: 0.1
          }
        }
      }
    }
  }
];

export const MCPServerModal: React.FC<MCPServerModalProps> = ({
  isOpen,
  plot,
  objects,
  violations,
  onClose,
  onExecuteMcpRpc
}) => {
  const [rpcInput, setRpcInput] = useState<string>(() =>
    JSON.stringify(SAMPLE_RPC_PRESETS[0].payload, null, 2)
  );
  const [rpcOutput, setRpcOutput] = useState<string>('');
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  if (!isOpen) return null;

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const mcpClientConfigJson = JSON.stringify(
    {
      mcpServers: {
        'genplan-expert-rf-3d': {
          url: `${originUrl}/mcp`,
          transport: 'http-jsonrpc',
          description:
            'ГенПлан-Эксперт РФ 3D — управление участком, постройками, природными объектами, ЗОУИТ и проверка СП/СНиП РФ через ИИ'
        }
      }
    },
    null,
    2
  );

  const handleRunRpc = async () => {
    setIsRunning(true);
    try {
      const parsed = JSON.parse(rpcInput) as Record<string, unknown>;
      const res = await onExecuteMcpRpc(parsed);
      setRpcOutput(JSON.stringify(res, null, 2));
    } catch (err) {
      setRpcOutput(
        JSON.stringify(
          {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: err instanceof Error ? err.message : 'Ошибка разбора JSON'
            }
          },
          null,
          2
        )
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyConfig = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(mcpClientConfigJson);
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      data-testid="mcp-server-modal"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/80 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-white">
                MCP-Сервер для ИИ и нейросетей (Model Context Protocol JSON-RPC 2.0)
              </h2>
              <p className="text-[11px] text-slate-400">
                Прямое управление генпланом, постройками, сетями и проверка норм РФ из Claude, Cursor, GPT и агентов
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-mcp-modal-btn"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300">
          {/* Status Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-700/40 flex items-start gap-2.5">
              <Server className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-emerald-300">HTTP Endpoint активен</div>
                <div className="text-[11px] text-slate-300 font-mono mt-0.5 break-all">
                  POST {originUrl}/mcp
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Также доступен: <span className="font-mono">/api/mcp/manifest</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-sky-950/30 border border-sky-700/40 flex items-start gap-2.5">
              <Terminal className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sky-300">Browser Bridge активен</div>
                <div className="text-[11px] text-slate-300 font-mono mt-0.5">
                  window.mcpServer.callTool()
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Мгновенная синхронизация 3D/2D сцены и сервера
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-800/70 border border-slate-700 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-200">Текущее состояние сцены</div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  Участок: {plot.width}×{plot.length} м ({plot.category})
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Объектов: {objects.length} | Нарушений СП: {violations.length}
                </div>
              </div>
            </div>
          </div>

          {/* Available Tools Summary & Config */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="font-semibold text-white">Доступные инструменты MCP (Tools):</div>
              <ul className="space-y-1.5 text-[11px] text-slate-300 font-mono">
                <li>
                  <span className="text-emerald-400 font-semibold">get_site_plan</span> — получить геометрию участка, объекты и нарушения СП РФ
                </li>
                <li>
                  <span className="text-emerald-400 font-semibold">update_plot_config</span> — изменить габариты участка, категорию (ИЖС/СНТ), регион, север
                </li>
                <li>
                  <span className="text-emerald-400 font-semibold">add_site_object</span> — добавить дом, баню, лес, дерево, реку, ЛЭП, газ, водопровод, дорогу
                </li>
                <li>
                  <span className="text-emerald-400 font-semibold">update_site_object</span> — изменить имя, координаты, размеры, крышу, скат или окна объекта
                </li>
                <li>
                  <span className="text-emerald-400 font-semibold">remove_site_object</span> — удалить объект с плана по ID
                </li>
                <li>
                  <span className="text-emerald-400 font-semibold">validate_sp_regulations</span> — полный аудит по СП 53.13330, СП 42.13330, СП 4.13130, ВК РФ, ЗК РФ
                </li>
                <li>
                  <span className="text-emerald-400 font-semibold">calculate_engineering_and_bom</span> — снеговая нагрузка (СП 20.13330) и смета материалов
                </li>
              </ul>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-white">Конфигурация для Claude / Cursor / MCP-клиента:</span>
                <button
                  type="button"
                  onClick={handleCopyConfig}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 transition-colors"
                >
                  {copiedConfig ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedConfig ? 'Скопировано' : 'Копировать JSON'}
                </button>
              </div>
              <pre className="p-2.5 rounded bg-slate-900 text-[10px] text-emerald-300 font-mono overflow-x-auto border border-slate-800">
                {mcpClientConfigJson}
              </pre>
            </div>
          </div>

          {/* Interactive JSON-RPC 2.0 Playground */}
          <div className="p-4 rounded-lg bg-slate-950/90 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Интерактивная консоль MCP JSON-RPC 2.0 (выполняет запрос на сервере и обновляет 3D/2D план)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_RPC_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    data-testid={`mcp-preset-${idx}`}
                    onClick={() => setRpcInput(JSON.stringify(preset.payload, null, 2))}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-sky-300 border border-slate-700 transition-colors"
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[11px] text-slate-400 font-medium">
                  Запрос JSON-RPC 2.0 (Request):
                </label>
                <textarea
                  data-testid="mcp-rpc-input"
                  value={rpcInput}
                  onChange={(e) => setRpcInput(e.target.value)}
                  rows={10}
                  className="w-full p-2.5 rounded bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  data-testid="mcp-execute-btn"
                  disabled={isRunning}
                  onClick={handleRunRpc}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  {isRunning ? 'Выполнение MCP-команды...' : 'Выполнить MCP JSON-RPC вызов'}
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] text-slate-400 font-medium">
                  Ответ MCP-сервера (Response):
                </label>
                <pre
                  data-testid="mcp-rpc-output"
                  className="w-full h-[220px] p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-auto whitespace-pre-wrap"
                >
                  {rpcOutput || '// Нажмите «Выполнить MCP JSON-RPC вызов», чтобы протестировать работу ИИ-протокола'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
