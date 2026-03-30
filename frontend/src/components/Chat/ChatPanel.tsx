'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { messageCircle, Send } from 'lucide-react';

interface Message {
  id: string;
  user_message: string;
  agent_response: string;
  created_at: string;
}

export default function ChatPanel() {
  const selectedAgent = useAppStore((state) => state.selectedAgent);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedAgent || !input.trim()) {
      return;
    }

    setLoading(true);

    try {
      // TODO: Implement API call to send message
      const simulatedResponse: Message = {
        id: Date.now().toString(),
        user_message: input,
        agent_response: 'Resposta simulada do agente (integração em progresso)',
        created_at: new Date().toISOString(),
      };

      setMessages([...messages, simulatedResponse]);
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedAgent) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400">
        <p>Selecione um agente para iniciar uma conversa</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
        <messageCircle size={20} className="text-accent" />
        <p className="font-medium">Chat com Agente</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm">
            Nenhuma mensagem ainda. Comece a conversa!
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              {/* User Message */}
              <div className="flex justify-end">
                <div className="bg-accent text-white rounded-lg px-3 py-2 max-w-xs text-sm break-words">
                  {msg.user_message}
                </div>
              </div>

              {/* Agent Response */}
              <div className="flex justify-start">
                <div className="bg-gray-700 text-gray-100 rounded-lg px-3 py-2 max-w-xs text-sm break-words">
                  {msg.agent_response}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Envie uma mensagem..."
            className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={loading || !selectedAgent}
          />
          <button
            type="submit"
            disabled={loading || !selectedAgent || !input.trim()}
            className="bg-accent text-white rounded-lg px-4 py-2 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
