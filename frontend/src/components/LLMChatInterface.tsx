'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Zap, Brain, Loader } from 'lucide-react';
import { enhancedApiClient } from '@/lib/enhanced-api';
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
  const abortRef = useRef<AbortController | null>(null);
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
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      await enhancedApiClient.streamChatMessage(
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
        },
        {},
        controller.signal
      );

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === streamingId
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    } catch (error) {
      try {
        // Fallback: non-stream chat for environments where SSE may fail.
        const fallback = await enhancedApiClient.sendChatMessage('', messageText, {});
        const responseText =
          fallback.data?.agent_response ||
          fallback.data?.message ||
          'Recebi sua mensagem, mas não consegui gerar uma resposta completa agora.';

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingId
              ? { ...msg, content: responseText, isStreaming: false }
              : msg
          )
        );
        notify.info('Resposta entregue via fallback');
      } catch {
        console.error('Error:', error);
        notify.error('Erro ao enviar mensagem');
      }
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-dark rounded-xl border border-primary/10 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5 flex items-center gap-2.5">
        <div className="relative">
          <Brain className="w-5 h-5 text-primary animate-pulse" />
          <Zap className="absolute w-3 h-3 text-yellow-400 -right-1 -bottom-1" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-primary">IA Coordinator</h3>
          <p className="text-[11px] text-gray-light">Powered by Claude AI</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[95%] px-3 py-2.5 rounded-lg border-2 ${
                msg.role === 'user'
                  ? 'bg-primary/10 border-primary/40 text-text-default'
                  : `bg-darker border-gray-metallic/30 text-text-default ${
                      msg.isStreaming ? 'animate-pulse' : ''
                    }`
              }`}
            >
              <div className="text-xs font-medium leading-relaxed">
                {msg.content || (msg.isStreaming && <Loader className="w-4 h-4 animate-spin inline" />)}
              </div>
              <div className="text-[11px] text-gray-light mt-1">
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
        className="px-4 py-3 border-t border-primary/10 bg-surface-alt/30 overflow-hidden"
      >
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            placeholder="Descreva seu objetivo..."
            className="
              flex-1 min-w-0 h-9 px-3 py-0 bg-darker border-2 border-gray-metallic/40 rounded-lg
              text-text-default placeholder-gray-light
              focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50
              focus:animate-blink-focus transition-all duration-300
              disabled:opacity-50 disabled:cursor-not-allowed
              font-medium text-xs
            "
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="
              h-9 w-9 rounded-lg font-bold
              bg-primary text-dark
              hover:shadow-lg hover:shadow-primary/50 active:scale-95
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-300
              border border-primary/80
              inline-flex items-center justify-center shrink-0
            "
            title="Enviar"
          >
            {isLoading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
