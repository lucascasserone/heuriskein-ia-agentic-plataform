'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, ChevronDown, X, Brain } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  agent?: string;
  chainOfThought?: string;
}

export default function CommandCenter() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'agent',
      content: 'Olá! Sou o seu Coordenador de Agentes. Qual é o seu objetivo?',
      timestamp: new Date(),
      agent: 'Coordenador',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showThoughts, setShowThoughts] = useState(false);
  const [selectedThought, setSelectedThought] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageText = inputValue;
    setInputValue('');
    setIsLoading(true);

    try {
      // Call actual API endpoint
      const response = await apiClient.sendChatMessage('', messageText);

      const agentResponse: Message = {
        id: response.data.id,
        role: 'agent',
        content: response.data.agent_response,
        timestamp: new Date(response.data.created_at),
        agent: response.data.agent,
        chainOfThought: `
1. Análise: Recebido objetivo - "${messageText}"
2. Classificação: Strategic Planning / Task Execution
3. Decomposição: Analisando em subtarefas
4. Alocação: Distribuindo entre agentes disponíveis
5. Status: Agentes iniciando processamento...
      `,
      };

      setMessages((prev) => [...prev, agentResponse]);
      setIsLoading(false);
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Fallback response
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: 'Desculpe, ocorreu um erro ao processar sua solicitação. Tente novamente.',
        timestamp: new Date(),
        agent: 'Sistema',
      };
      
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
    }
  };

  const hasThoughts = messages.some((m) => m.chainOfThought);

  return (
    <div className="flex flex-col h-full bg-dark rounded-xl border border-primary/10 overflow-hidden">
      {/* ===== HEADER ===== */}
      <div className="px-6 py-4 border-b border-primary/10 bg-surface-alt/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Brain size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-text-title">Central de Comando</h2>
            <p className="text-xs text-gray-light">Orquestração de Agentes IA</p>
          </div>
        </div>

        {hasThoughts && (
          <button
            onClick={() => setShowThoughts(!showThoughts)}
            className="
              p-2 rounded-lg transition-all duration-300
              bg-primary/15 hover:bg-primary/25 text-primary
              border border-primary/20 hover:border-primary/40
              relative
            "
            title="Visualizar Chain of Thought"
          >
            <Brain size={18} className="animate-glow-icon" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
          </button>
        )}
      </div>

      {/* ===== MESSAGES AREA ===== */}
      <div className={`flex-1 overflow-y-auto p-6 space-y-4 transition-all duration-300`}>
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isSelected={selectedThought === message.id}
            onSelectThought={() => setSelectedThought(message.id)}
          />
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-primary font-bold">A</span>
            </div>
            <div className="flex-1">
              <div className="glassmorphism p-4 rounded-lg">
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ===== CHAIN OF THOUGHT PANEL ===== */}
      {showThoughts && selectedThought && (
        <div className="border-t border-primary/10 bg-surface-alt/70 p-4 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-text-title uppercase tracking-widest">
              Chain of Thought
            </h3>
            <button
              onClick={() => setShowThoughts(false)}
              className="p-1 hover:bg-primary/10 rounded transition-colors"
            >
              <X size={16} className="text-gray-light" />
            </button>
          </div>
          <div className="text-xs text-gray-lighter font-mono whitespace-pre-wrap leading-relaxed space-y-1">
            {messages.find((m) => m.id === selectedThought)?.chainOfThought}
          </div>
        </div>
      )}

      {/* ===== INPUT AREA ===== */}
      <div className="border-t border-primary/10 bg-surface p-4">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Descreva seu objetivo..."
            disabled={isLoading}
            className="
              flex-1 bg-darker border-2 border-gray-metallic/40 rounded-lg px-4 py-3
              text-text-default placeholder-gray-light
              focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
              transition-all duration-300
              disabled:opacity-50 disabled:cursor-not-allowed
              font-mono text-sm
            "
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="
              px-4 py-3 rounded-lg font-bold transition-all duration-300
              bg-primary text-dark
              hover:shadow-glow-primary-lg hover:scale-105
              active:scale-95
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2
            "
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  isSelected: boolean;
  onSelectThought: () => void;
}

function MessageBubble({ message, isSelected, onSelectThought }: MessageBubbleProps) {
  return (
    <div
      className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {message.role === 'agent' && (
        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
          <span className="text-xs text-primary font-bold">A</span>
        </div>
      )}

      <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
        <div
          className={`
            px-4 py-3 rounded-lg max-w-sm transition-all duration-300
            ${
              message.role === 'user'
                ? 'bg-primary text-dark font-medium'
                : 'glassmorphism border border-primary/30 bg-gradient-to-br from-surface/40 to-surface-alt/40 text-text-default'
            }
          `}
        >
          <p className="text-sm leading-relaxed">{message.content}</p>
          {message.agent && message.role === 'agent' && (
            <p className="text-xs mt-2 text-gray-light">— {message.agent}</p>
          )}
        </div>

        {message.chainOfThought && (
          <button
            onClick={onSelectThought}
            className={`
              text-xs mt-2 px-2 py-1 rounded transition-all font-medium
              ${
                isSelected
                  ? 'text-primary bg-primary/15 border border-primary/30'
                  : 'text-gray-light hover:text-primary hover:bg-primary/10'
              }
            `}
          >
            {isSelected ? '✓ Raciocínio Expandido' : 'Ver Raciocínio'}
          </button>
        )}
      </div>

      {message.role === 'user' && (
        <div className="w-8 h-8 rounded-lg bg-primary text-dark flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold">U</span>
        </div>
      )}
    </div>
  );
}
