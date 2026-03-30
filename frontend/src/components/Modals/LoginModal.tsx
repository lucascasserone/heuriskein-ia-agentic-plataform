'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, LogIn } from 'lucide-react';
import { useNotify } from '@/lib/toast';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/store/appStore';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [registerData, setRegisterData] = useState({
    username: '',
    email: '',
    password: '',
    password2: '',
    first_name: '',
    last_name: '',
  });
  const notify = useNotify();
  const { setUser, setTokens } = useAppStore();

  if (!isOpen) return null;

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRegisterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRegisterData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    notify.loading('Autenticando...');

    try {
      const response = await apiClient.login(formData.username, formData.password);
      const { access, refresh, user } = response.data;
      
      // Update store with tokens and user
      setTokens(access, refresh);
      setUser(user);
      
      // Save tokens to localStorage
      localStorage.setItem('accessToken', access);
      localStorage.setItem('refreshToken', refresh);
      localStorage.setItem('user', JSON.stringify(user));
      
      // Set auth header for API client
      apiClient.setAuthToken(access, refresh);
      
      notify.success('Login bem-sucedido!');
      setFormData({ username: '', password: '' });
      onClose();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data?.detail || 'Erro ao fazer login';
      notify.error(errorMsg);
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    notify.loading('Criando conta...');

    try {
      if (registerData.password !== registerData.password2) {
        notify.error('Senhas não correspondem');
        setLoading(false);
        return;
      }

      const response = await apiClient.register(
        registerData.username,
        registerData.email,
        registerData.password
      );

      const { access, refresh, user } = response.data;
      
      // Update store with tokens and user
      setTokens(access, refresh);
      setUser(user);
      
      // Save tokens to localStorage
      localStorage.setItem('accessToken', access);
      localStorage.setItem('refreshToken', refresh);
      localStorage.setItem('user', JSON.stringify(user));
      
      // Set auth header for API client
      apiClient.setAuthToken(access, refresh);
      
      notify.success('Conta criada com sucesso!');
      setRegisterData({
        username: '',
        email: '',
        password: '',
        password2: '',
        first_name: '',
        last_name: '',
      });
      onClose();
    } catch (error: any) {
      const errorMsg = 
        error.response?.data?.username?.[0] || 
        error.response?.data?.email?.[0] || 
        error.response?.data?.detail ||
        'Erro ao criar conta';
      notify.error(errorMsg);
      console.error('Register error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <motion.div
        className="animate-slide-in-up w-full max-w-md"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="glassmorphism-strong rounded-xl border border-primary/30 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-primary/20 bg-primary text-dark flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LogIn size={20} />
              <h2 className="text-lg font-bold">
                {isRegister ? 'Nova Conta' : 'Entrar'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-black/20 rounded transition-colors"
            >
              <X size={20} className="text-dark" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={isRegister ? handleRegister : handleLogin} className="p-6 space-y-4">
            {!isRegister ? (
              // Login Form
              <>
                <div>
                  <label className="block text-sm font-semibold text-text-title mb-2">
                    Usuário
                  </label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleLoginChange}
                    placeholder="seu_usuario"
                    required
                    disabled={loading}
                    className="
                      w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                      text-text-default placeholder-gray-light
                      focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
                      transition-all duration-300
                      disabled:opacity-50 disabled:cursor-not-allowed
                      font-medium
                    "
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-text-title mb-2">
                    Senha
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleLoginChange}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    className="
                      w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                      text-text-default placeholder-gray-light
                      focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
                      transition-all duration-300
                      disabled:opacity-50 disabled:cursor-not-allowed
                      font-medium
                    "
                  />
                </div>
              </>
            ) : (
              // Register Form
              <>
                <div>
                  <label className="block text-sm font-semibold text-text-title mb-2">
                    Usuário
                  </label>
                  <input
                    type="text"
                    name="username"
                    value={registerData.username}
                    onChange={handleRegisterChange}
                    placeholder="seu_usuario"
                    required
                    disabled={loading}
                    className="
                      w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                      text-text-default placeholder-gray-light
                      focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
                      transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
                      font-medium
                    "
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-text-title mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={registerData.email}
                    onChange={handleRegisterChange}
                    placeholder="seu@email.com"
                    required
                    disabled={loading}
                    className="
                      w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                      text-text-default placeholder-gray-light
                      focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
                      transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
                      font-medium
                    "
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-text-title mb-2">
                      Nome
                    </label>
                    <input
                      type="text"
                      name="first_name"
                      value={registerData.first_name}
                      onChange={handleRegisterChange}
                      placeholder="João"
                      disabled={loading}
                      className="
                        w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                        text-text-default placeholder-gray-light text-sm
                        focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
                        transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
                        font-medium
                      "
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-text-title mb-2">
                      Sobrenome
                    </label>
                    <input
                      type="text"
                      name="last_name"
                      value={registerData.last_name}
                      onChange={handleRegisterChange}
                      placeholder="Silva"
                      disabled={loading}
                      className="
                        w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                        text-text-default placeholder-gray-light text-sm
                        focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
                        transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
                        font-medium
                      "
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-text-title mb-2">
                    Senha
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={registerData.password}
                    onChange={handleRegisterChange}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    className="
                      w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                      text-text-default placeholder-gray-light
                      focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
                      transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
                      font-medium
                    "
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-text-title mb-2">
                    Confirmar Senha
                  </label>
                  <input
                    type="password"
                    name="password2"
                    value={registerData.password2}
                    onChange={handleRegisterChange}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    className="
                      w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                      text-text-default placeholder-gray-light
                      focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
                      transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
                      font-medium
                    "
                  />
                </div>
              </>
            )}

            {/* Buttons */}
            <div className="flex flex-col gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="
                  w-full px-4 py-2.5 rounded-lg font-bold
                  bg-primary text-dark
                  hover:shadow-lg hover:shadow-primary/50 active:scale-95
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-300
                  border border-primary/80
                "
              >
                {loading ? 'Processando...' : isRegister ? 'Criar Conta' : 'Entrar'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setFormData({ username: '', password: '' });
                  setRegisterData({
                    username: '',
                    email: '',
                    password: '',
                    password2: '',
                    first_name: '',
                    last_name: '',
                  });
                }}
                className="
                  w-full px-4 py-2.5 rounded-lg font-bold
                  border-2 border-primary/50 text-primary
                  hover:bg-primary/15 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {isRegister ? 'Ou entre na sua conta' : 'Ou crie uma nova conta'}
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="
                  w-full px-4 py-2.5 rounded-lg font-bold
                  border-2 border-gray-metallic/30 text-gray-light
                  hover:bg-gray-metallic/10 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                Fechar
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
