"""
LLM Service for Claude and OpenAI integration
Handles model inference, streaming, and token counting
"""

import os
from typing import AsyncGenerator, Generator, Optional
from abc import ABC, abstractmethod
from decouple import config

try:
    from anthropic import Anthropic, AsyncAnthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

try:
    from openai import OpenAI, AsyncOpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False


class LLMProvider(ABC):
    """Abstract base class for LLM providers"""
    
    @abstractmethod
    def chat(self, messages: list[dict], system: Optional[str] = None) -> str:
        """Non-streaming chat"""
        pass
    
    @abstractmethod
    def stream_chat(self, messages: list[dict], system: Optional[str] = None) -> Generator[str, None, None]:
        """Streaming chat response"""
        pass


class ClaudeProvider(LLMProvider):
    """Anthropic Claude provider"""
    
    def __init__(self):
        if not HAS_ANTHROPIC:
            raise ImportError("anthropic package not installed")
        
        api_key = config('ANTHROPIC_API_KEY', default='')
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not configured in environment")
        
        self.model = config('CLAUDE_MODEL', default='claude-3-5-sonnet-20241022')
        self.client = Anthropic(api_key=api_key)
    
    def chat(self, messages: list[dict], system: Optional[str] = None) -> str:
        """Get non-streaming response from Claude"""
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                system=system or "You are a helpful AI assistant analyzing tasks and providing insights.",
                messages=messages,
            )
            return response.content[0].text
        except Exception as e:
            raise Exception(f"Claude API error: {str(e)}")
    
    def stream_chat(self, messages: list[dict], system: Optional[str] = None) -> Generator[str, None, None]:
        """Stream response from Claude"""
        try:
            with self.client.messages.stream(
                model=self.model,
                max_tokens=2048,
                system=system or "You are a helpful AI assistant analyzing tasks and providing insights.",
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    yield text
        except Exception as e:
            yield f"Error: {str(e)}"


class OpenAIProvider(LLMProvider):
    """OpenAI GPT provider"""
    
    def __init__(self):
        if not HAS_OPENAI:
            raise ImportError("openai package not installed")
        
        api_key = config('OPENAI_API_KEY', default='')
        if not api_key:
            raise ValueError("OPENAI_API_KEY not configured in environment")
        
        self.model = config('OPENAI_MODEL', default='gpt-4')
        self.client = OpenAI(api_key=api_key)
    
    def chat(self, messages: list[dict], system: Optional[str] = None) -> str:
        """Get non-streaming response from OpenAI"""
        try:
            system_message = system or "You are a helpful AI assistant analyzing tasks and providing insights."
            all_messages = [
                {"role": "system", "content": system_message},
                *messages
            ]
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=all_messages,
                temperature=0.7,
                max_tokens=2048,
            )
            return response.choices[0].message.content
        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")
    
    def stream_chat(self, messages: list[dict], system: Optional[str] = None) -> Generator[str, None, None]:
        """Stream response from OpenAI"""
        try:
            system_message = system or "You are a helpful AI assistant analyzing tasks and providing insights."
            all_messages = [
                {"role": "system", "content": system_message},
                *messages
            ]
            
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=all_messages,
                temperature=0.7,
                max_tokens=2048,
                stream=True,
            )
            
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            yield f"Error: {str(e)}"


class LLMService:
    """Unified LLM service that manages provider selection"""
    
    def __init__(self):
        provider_name = config('LLM_PROVIDER', default='anthropic')
        
        if provider_name == 'anthropic':
            try:
                self.provider = ClaudeProvider()
            except (ImportError, ValueError) as e:
                raise Exception(f"Failed to initialize Claude: {str(e)}")
        elif provider_name == 'openai':
            try:
                self.provider = OpenAIProvider()
            except (ImportError, ValueError) as e:
                raise Exception(f"Failed to initialize OpenAI: {str(e)}")
        else:
            raise ValueError(f"Unknown LLM provider: {provider_name}")
    
    def chat(self, messages: list[dict], system: Optional[str] = None) -> str:
        """Get response from configured LLM"""
        return self.provider.chat(messages, system)
    
    def stream_chat(self, messages: list[dict], system: Optional[str] = None) -> Generator[str, None, None]:
        """Stream response from configured LLM"""
        return self.provider.stream_chat(messages, system)
    
    def format_task_prompt(self, task: dict) -> str:
        """Format a task into a prompt for the LLM"""
        prompt = f"""
Analizar a seguinte tarefa e fornecer insights:

Tarefa: {task.get('title', 'N/A')}
Descrição: {task.get('description', 'N/A')}
Status: {task.get('status', 'N/A')}
Prioridade: {task.get('priority', 'N/A')}

Por favor, forneça análise, próximos passos e recomendações.
        """
        return prompt
    
    def format_epic_prompt(self, epic: dict) -> str:
        """Format an epic into a prompt for the LLM"""
        prompt = f"""
Analisar a seguinte épica e fornecer insight de negócio:

Objetivo: {epic.get('goal', 'N/A')}
Descrição: {epic.get('description', 'N/A')}
Status: {epic.get('status', 'N/A')}
Prioridade: {epic.get('priority', 'N/A')}

Por favor, forneça análise de viabilidade, riscos e oportunidades.
        """
        return prompt


# Singleton instance
_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    """Get or create LLM service singleton"""
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service
