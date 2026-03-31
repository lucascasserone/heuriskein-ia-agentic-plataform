'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Zap, Brain, Loader } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useNotify } from '@/lib/toast';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export default function LLMChatInterface() {
  const [isMounted, setIsMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'agent',
      content: '🤖 Olá! Sou o Coordenador de Agentes IA. Descreva seu objetivo e vou decompor em tarefas inteligentes.',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const notify = useNotify();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('pt-BR', {
      hour12: false,
    });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageText = inputValue;
    setInputValue('');
    setIsLoading(true);

    // Add streaming message placeholder
    const streamingId = `stream-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: streamingId,
        role: 'agent',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    try {
      await apiClient.streamChatMessage(
        messageText,
        (chunk) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingId
                ? { ...msg, content: msg.content + chunk }
                : msg
            )
          );
        },
        (error) => {
          notify.error(`Erro na resposta: ${error}`);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingId
                ? {
                    ...msg,
                    content: `❌ Erro: ${error}. Configure ANTHROPIC_API_KEY ou OPENAI_API_KEY no .env`,
                    isStreaming: false,
                  }
                : msg
            )
          );
        }
      );

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === streamingId
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    } catch (error) {
      console.error('Error:', error);
      notify.error('Erro ao enviar mensagem');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-dark rounded-xl border border-primary/10 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5 flex items-center gap-3">
        <div className="relative">
          <Brain className="w-5 h-5 text-primary animate-pulse" />
          <Zap className="absolute w-3 h-3 text-yellow-400 -right-1 -bottom-1" />
        </div>
        <div>
          <h3 className="text-title font-bold text-primary">IA Coordinator</h3>
          <p className="text-xs text-gray-light">Powered by Claude AI</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-md px-4 py-3 rounded-lg border-2 ${
                msg.role === 'user'
                  ? 'bg-primary/10 border-primary/40 text-text-default'
                  : `bg-darker border-gray-metallic/30 text-text-default ${
                      msg.isStreaming ? 'animate-pulse' : ''
                    }`
              }`}
            >
              <div className="text-sm font-medium">
                {msg.content || (msg.isStreaming && <Loader className="w-4 h-4 animate-spin inline" />)}
              </div>
              <div className="text-xs text-gray-light mt-1">
                {isMounted ? formatTime(msg.timestamp) : '--:--:--'}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSendMessage}
        className="px-6 py-4 border-t border-primary/10 bg-surface-alt/30"
      >
        <div className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            placeholder="Descreva seu objetivo..."
            className="
              flex-1 px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
              text-text-default placeholder-gray-light
              focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50
              focus:animate-blink-focus transition-all duration-300
              disabled:opacity-50 disabled:cursor-not-allowed
              font-medium text-sm
            "
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="
              px-4 py-2.5 rounded-lg font-bold
              bg-primary text-dark
              hover:shadow-lg hover:shadow-primary/50 active:scale-95
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-300
              border border-primary/80
              flex items-center gap-2
            "
          >
            {isLoading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Enviar</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
