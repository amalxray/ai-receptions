'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, MessageCircle, X, Phone, Clock } from 'lucide-react';

interface Message {
  role: 'user' | 'bot';
  content: string;
}

interface Props {
  clinicId: string;
  mode?: 'compact' | 'inline' | 'floating';
}

export default function QuickClinicChat({ clinicId, mode: initialMode = 'compact' }: Props) {
  const [mode, setMode] = useState<'compact' | 'inline' | 'floating'>(initialMode);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'bot', content: '' }]);

    try {
      const res = await fetch('/api/public/quick-clinic-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, message: text }),
      });
      if (!res.ok || !res.body) {
        throw new Error('فشل الاتصال');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          try {
            const json = JSON.parse(trimmed.slice(5).trim());
            const token = json.token ?? '';
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'bot') {
                last.content += token;
              }
              return [...prev];
            });
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'bot') {
          last.content = 'عذراً، حدث خطأ. يرجى المحاولة لاحقاً.';
        }
        return [...prev];
      });
    } finally {
      setIsLoading(false);
    }
  }, [clinicId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const renderBubble = (msg: Message) => (
    <div
      key={msg.content + msg.role}
      className={`max-w-[85%] p-3 rounded-2xl mb-2 ${msg.role === 'user'
        ? 'bg-gradient-to-l from-cyan-500 to-emerald-500 text-slate-950 ml-auto'
        : 'bg-slate-800 border border-white/10 text-white mr-auto'}`}
    >
      {msg.content}
    </div>
  );

  const typingIndicator = (
    <div className="bg-slate-800 border border-white/10 text-white p-3 rounded-2xl mb-2 max-w-xs mr-auto">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-bounce"> </span>
        <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}> </span>
        <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}> </span>
      </span>
    </div>
  );

  const compactView = (
    <div className="max-w-xs mx-auto mt-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          placeholder="💬 هل لديك سؤال؟ اكتب هنا..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white focus:border-cyan-400/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-xl bg-gradient-to-l from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
        >
          إرسال
        </button>
      </form>
    </div>
  );

  const inlineView = (
    <div className="max-w-md mx-auto mt-4 h-96 rounded-2xl border border-white/10 bg-slate-900/60 p-4 flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-2">
        {messages.map((m, i) => (
          <div key={i}>
            {m.role === 'bot' && i === messages.length - 1 && isLoading ? typingIndicator : renderBubble(m)}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <input
          type="text"
          placeholder="أكتب رسالتك هنا..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          className="flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white text-sm focus:border-cyan-400/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-xl bg-gradient-to-l from-cyan-500 to-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
        >
          إرسال
        </button>
      </form>
    </div>
  );

  const floatingView = (
    <div className="fixed bottom-6 left-6 z-40">
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setMode('inline')}
        className="h-14 w-14 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 shadow-2xl flex items-center justify-center"
      >
        <MessageCircle className="h-7 w-7 text-slate-950" />
      </motion.button>
      {mode === 'inline' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-24 left-6 z-30 max-w-md w-full"
        >
          <div className="rounded-3xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">المساعدة السريعة</h3>
              <button
                onClick={() => setMode('compact')}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {inlineView}
          </div>
        </motion.div>
      )}
    </div>
  );

  return (
    <>
      {mode === 'compact' && compactView}
      {mode === 'inline' && inlineView}
      {mode === 'floating' && floatingView}
    </>
  );
}