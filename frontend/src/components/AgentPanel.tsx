'use client';

import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { apiClient } from '@/lib/api';
import { Users, Circle } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  state: 'idle' | 'thinking' | 'executing' | 'blocked';
  model: string;
  llm_model?: string;
  llm_provider?: string;
  capabilities: string[];
  current_task: string | null;
}

const stateColors = {
  idle: 'bg-green-500',
  thinking: 'bg-yellow-500',
  executing: 'bg-blue-500',
  blocked: 'bg-red-500',
};

const stateLabels = {
  idle: 'Disponível',
  thinking: 'Pensando',
  executing: 'Executando',
  blocked: 'Bloqueado',
};

export default function AgentPanel() {
  const [agents, setAgents] = useAppStore((state) => [
    state.agents,
    state.setAgents,
  ]);
  const selectedAgent = useAppStore((state) => state.selectedAgent);
  const setSelectedAgent = useAppStore((state) => state.setSelectedAgent);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        // Keep Team Hub in sync with the registered agents list used in Organizacao/Team.
        const response = await apiClient.getAgents();
        setAgents(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error('Error fetching agents:', error);
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 30000);

    return () => clearInterval(interval);
  }, [setAgents]);

  if (!agents || agents.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400">
        <p>Nenhum agente disponível</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Users size={20} className="text-accent" />
        <h3 className="font-bold text-lg">Agentes Ativos</h3>
        <span className="ml-auto text-sm bg-accent text-white px-2 py-1 rounded">
          {agents.length}
        </span>
      </div>

      <div className="space-y-2">
        {agents.map((agent: Agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={selectedAgent === agent.id}
            onSelect={() => setSelectedAgent(agent.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface AgentCardProps {
  agent: Agent;
  selected: boolean;
  onSelect: () => void;
}

function AgentCard({ agent, selected, onSelect }: AgentCardProps) {
  const stateColor = stateColors[agent.state] || stateColors.idle;
  const stateLabel = stateLabels[agent.state] || 'Desconhecido';

  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-lg cursor-pointer transition ${
        selected
          ? 'bg-accent bg-opacity-20 border border-accent'
          : 'bg-gray-700 hover:bg-gray-600 border border-gray-700'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Circle size={8} className={stateColor} fill="currentColor" />
            <p className="font-medium truncate">{agent.name}</p>
          </div>
          <p className="text-xs text-gray-400 mt-1">{agent.llm_model || agent.model}</p>
          {agent.llm_provider ? (
            <p className="text-[11px] text-gray-500">{agent.llm_provider}</p>
          ) : null}
          <p className="text-xs text-gray-500">{stateLabel}</p>
        </div>
      </div>

      {agent.capabilities.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {agent.capabilities.slice(0, 2).map((cap, idx) => (
            <span
              key={idx}
              className="text-xs bg-gray-600 text-gray-200 px-2 py-1 rounded"
            >
              {cap}
            </span>
          ))}
          {agent.capabilities.length > 2 && (
            <span className="text-xs text-gray-400">
              +{agent.capabilities.length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
