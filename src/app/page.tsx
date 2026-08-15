"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Square, FileDown, Search, Activity, Sparkles, MonitorPlay, CheckCircle2, ChevronRight, Volume2, Loader2, Send, Bot, User } from 'lucide-react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';

interface SummaryData {
  title: string;
  executiveSummary: string[];
  keyHighlights: { timestamp: string; point: string }[];
  deepDive: string;
  actionables: string[];
  fullTranscript: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function VidBriefPage() {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [language, setLanguage] = useState('English');
  
  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // PDF Ref
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        
        // Smart Voice Selection based on Language
        if (availableVoices.length > 0) {
          let preferredVoice = null;
          if (language === 'Hindi') preferredVoice = availableVoices.find(v => v.lang === 'hi-IN');
          else if (language === 'Marathi') preferredVoice = availableVoices.find(v => v.lang === 'mr-IN');
          else if (language === 'Urdu') preferredVoice = availableVoices.find(v => v.lang.startsWith('ur'));
          else if (language === 'Hinglish') preferredVoice = availableVoices.find(v => v.lang === 'hi-IN' || v.lang === 'en-IN');
          else preferredVoice = availableVoices.find(v => v.name.includes('Google') || v.lang === 'en-US');
          
          if (preferredVoice) setSelectedVoiceURI(preferredVoice.voiceURI);
          else setSelectedVoiceURI(availableVoices[0].voiceURI);
        }
      };

      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, [language]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const extractVideoId = (link: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = link.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleSummarize = async () => {
    setError(null);
    if (!url) {
      setError('Please enter a YouTube URL');
      return;
    }
    const id = extractVideoId(url);
    if (!id) {
      setError('Invalid YouTube URL');
      return;
    }
    setVideoId(id);
    setLoading(true);
    setSummary(null);
    setChatMessages([{ role: 'assistant', content: 'Hi! I have analyzed the video. What would you like to know about it?' }]);

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, language })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to summarize');
      }
      
      setSummary(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // Chat Handlers
  // ---------------------------------------------------------
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !summary) return;
    
    const userMsg: ChatMessage = { role: 'user', content: chatInput };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          transcript: summary.fullTranscript,
          language
        })
      });

      if (!res.ok) throw new Error('Chat API failed');
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      // Add a temporary empty assistant message to stream into
      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        
        setChatMessages(prev => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          updated[lastIndex] = { ...updated[lastIndex], content: updated[lastIndex].content + chunk };
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsChatLoading(false);
    }
  };

  // ---------------------------------------------------------
  // Audio Controls
  // ---------------------------------------------------------
  const prepareTextForAudio = () => {
    if (!summary) return '';
    let text = `Here is the summary for ${summary.title}. `;
    text += `Executive Summary: `;
    summary.executiveSummary.forEach(point => text += `${point}. `);
    text += `Key Highlights: `;
    summary.keyHighlights.forEach(h => text += `At ${h.timestamp}, ${h.point}. `);
    return text;
  };

  const handlePlay = () => {
    if (!synthRef.current || !summary) return;

    if (isPaused) {
      synthRef.current.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    synthRef.current.cancel();
    const textToRead = prepareTextForAudio();
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.rate = playbackSpeed;
    
    if (selectedVoiceURI) {
      const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (selectedVoice) utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    if (synthRef.current && isPlaying && !isPaused) {
      synthRef.current.pause();
      setIsPaused(true);
    }
  };

  const handleStop = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (isPlaying && !isPaused && utteranceRef.current && synthRef.current) {
      const currentlyPaused = isPaused;
      handleStop();
      setTimeout(() => {
        handlePlay();
        if (currentlyPaused) handlePause();
      }, 50);
    }
  };

  const changeVoice = (uri: string) => {
    setSelectedVoiceURI(uri);
    if (isPlaying) {
      const currentlyPaused = isPaused;
      handleStop();
      setTimeout(() => {
        handlePlay();
        if (currentlyPaused) handlePause();
      }, 50);
    }
  };

  // ---------------------------------------------------------
  // PDF Export
  // ---------------------------------------------------------
  const handleExportPDF = async () => {
    if (!pdfContainerRef.current) return;
    const html2pdf = (await import('html2pdf.js')).default;
    
    const opt = {
      margin:       10,
      filename:     `VidBrief_${summary?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'summary'}.pdf`,
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    html2pdf().from(pdfContainerRef.current).set(opt).save();
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-purple-500/30 font-sans relative overflow-hidden flex flex-col">
      
      {/* Background Ambient Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 blur-[150px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 blur-[150px] rounded-full pointer-events-none"></div>

      {/* Navbar */}
      <motion.nav 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50 shrink-0"
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(168,85,247,0.4)] group-hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] transition-all duration-300">
              <Image src="/logo.jpg" alt="VidBrief Logo" layout="fill" objectFit="cover" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              VidBrief AI
            </span>
          </div>
          
          <div className="flex-1 max-w-2xl mx-8 relative flex items-center gap-3">
            <div className="relative flex-1 group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <MonitorPlay className="h-5 w-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSummarize()}
                placeholder="Paste YouTube URL..."
                className="block w-full pl-12 pr-4 py-3 border border-white/10 rounded-full bg-white/5 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:bg-white/10 transition-all shadow-inner"
              />
            </div>
            
            <div className="shrink-0 relative">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="appearance-none bg-white/5 border border-white/10 rounded-full py-3 pl-4 pr-8 text-sm font-medium focus:outline-none focus:border-purple-500/50 hover:bg-white/10 transition-colors text-gray-200 cursor-pointer"
              >
                <option value="English" className="bg-gray-900">English</option>
                <option value="Hindi" className="bg-gray-900">Hindi</option>
                <option value="Hinglish" className="bg-gray-900">Hinglish</option>
                <option value="Urdu" className="bg-gray-900">Urdu</option>
                <option value="Marathi" className="bg-gray-900">Marathi</option>
              </select>
            </div>

            <div className="shrink-0">
              <button
                onClick={handleSummarize}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-bold tracking-wide rounded-full hover:shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Summarize'}
              </button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-7xl mx-auto mt-6 px-6 relative z-40"
          >
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-5 py-4 rounded-2xl text-sm flex items-center gap-3 shadow-[0_0_20px_rgba(239,68,68,0.1)] backdrop-blur-md">
              <Activity className="w-5 h-5" />
              <span className="font-medium">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Layout */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row gap-10 relative z-10 flex-1">
        
        {/* Left Panel: 35% Video Player + Chat Box */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full lg:w-[35%] flex flex-col gap-6"
        >
          {/* Video Player */}
          <div className="aspect-video bg-white/5 rounded-3xl border border-white/10 overflow-hidden shadow-2xl relative group flex items-center justify-center backdrop-blur-md shrink-0">
            {videoId ? (
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0"
              ></iframe>
            ) : (
              <div className="flex flex-col items-center text-gray-500">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                  <MonitorPlay className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-sm font-medium tracking-wide">Awaiting Video URL</p>
              </div>
            )}
          </div>

          {/* AI Chat Box */}
          <AnimatePresence>
            {summary && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/10 rounded-3xl backdrop-blur-xl flex flex-col overflow-hidden shadow-2xl max-h-[600px] min-h-[400px]"
              >
                {/* Chat Header */}
                <div className="p-4 border-b border-white/5 bg-black/20 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-200">Ask VidBrief AI</h3>
                    <p className="text-[10px] text-gray-500">I have read the transcript!</p>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-white/10' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'}`}>
                        {msg.role === 'user' ? <User className="w-3 h-3 text-gray-300" /> : <Bot className="w-3 h-3" />}
                      </div>
                      <div className={`max-w-[80%] rounded-2xl p-3 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white/5 text-gray-300 rounded-tl-sm border border-white/5'}`}>
                        {msg.content === '' && i === chatMessages.length - 1 && isChatLoading ? (
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-.15s]"></span>
                            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-.3s]"></span>
                          </span>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="p-4 border-t border-white/5 bg-black/20">
                  <div className="relative">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask a question about the video..."
                      className="w-full bg-white/5 border border-white/10 rounded-full py-2.5 pl-4 pr-12 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={isChatLoading || !chatInput.trim()}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center disabled:opacity-50 hover:bg-purple-400 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Right Panel: 65% Summary Content & Audio Controls */}
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full lg:w-[65%] flex flex-col gap-6"
        >
          {loading ? (
            <div className="h-[700px] bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-[40px] flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(168,85,247,0.2)] backdrop-blur-sm relative z-10"
              >
                <Sparkles className="w-8 h-8 text-purple-400" />
              </motion.div>
              <div className="flex flex-col items-center z-10">
                <h3 className="text-xl font-bold text-white mb-2">Analyzing Video via Groq AI</h3>
                <p className="text-gray-400 text-sm font-medium">Extracting transcripts and generating structured insights...</p>
                <div className="w-48 h-1 bg-white/10 rounded-full mt-6 overflow-hidden">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className="w-1/2 h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                  />
                </div>
              </div>
            </div>
          ) : summary ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-6"
            >
              
              {/* Audio Controls & Export Bar */}
              <div className="flex flex-wrap items-center justify-between bg-white/[0.03] border border-white/10 rounded-3xl p-4 px-6 backdrop-blur-md">
                
                {/* Voice & Playback */}
                <div className="flex items-center gap-6">
                  {/* Play Buttons */}
                  <div className="flex items-center gap-3">
                    <button onClick={handlePlay} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all">
                      <Play className="w-4 h-4 ml-0.5" />
                    </button>
                    <button onClick={handlePause} disabled={!isPlaying || isPaused} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all border border-white/5 disabled:opacity-30">
                      <Pause className="w-4 h-4" />
                    </button>
                    <button onClick={handleStop} disabled={!isPlaying && !isPaused} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all border border-white/5 disabled:opacity-30">
                      <Square className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Voice Selector */}
                  <div className="flex items-center gap-2 border-l border-white/10 pl-6">
                    <Volume2 className="w-4 h-4 text-gray-400" />
                    <select 
                      value={selectedVoiceURI} 
                      onChange={(e) => changeVoice(e.target.value)}
                      className="bg-transparent text-sm font-medium text-gray-300 focus:outline-none max-w-[150px] truncate cursor-pointer hover:text-white transition-colors"
                    >
                      {voices.map(v => (
                        <option key={v.voiceURI} value={v.voiceURI} className="bg-gray-900 text-white">
                          [{v.lang}] {v.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Speed Selector */}
                  <div className="flex gap-1 border-l border-white/10 pl-6">
                    {[1, 1.25, 1.5].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => changeSpeed(speed)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          playbackSpeed === speed 
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                            : 'text-gray-500 hover:text-gray-300 border border-transparent'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* PDF Export */}
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-semibold transition-all text-gray-300"
                >
                  <FileDown className="w-4 h-4" />
                  Export PDF
                </button>
              </div>

              {/* Printable PDF Container */}
              <div ref={pdfContainerRef} className="bg-[#0A0A0C] border border-white/10 rounded-[40px] p-10 md:p-14 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none"></div>
                
                <h1 className="text-4xl md:text-5xl font-extrabold mb-12 leading-[1.15] tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-200 to-gray-500 relative z-10">
                  {summary.title}
                </h1>

                {/* Executive Summary */}
                <section className="mb-12 relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-purple-400">
                      Executive Summary
                    </h2>
                  </div>
                  <div className="grid gap-4">
                    {summary.executiveSummary.map((bullet, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        key={idx} 
                        className="flex gap-4 items-start bg-gradient-to-r from-white/5 to-transparent p-5 rounded-2xl border-l-2 border-purple-500/50 hover:bg-white/[0.07] transition-colors"
                      >
                        <CheckCircle2 className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                        <p className="text-gray-300 leading-relaxed font-medium">{bullet}</p>
                      </motion.div>
                    ))}
                  </div>
                </section>

                {/* Key Highlights */}
                <section className="mb-12 relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                      <Activity className="w-4 h-4 text-indigo-400" />
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-400">
                      Key Highlights
                    </h2>
                  </div>
                  <div className="space-y-3">
                    {summary.keyHighlights.map((hl, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={idx} 
                        className="flex flex-col sm:flex-row sm:items-center gap-4 group p-4 bg-white/[0.02] hover:bg-white/[0.06] rounded-2xl border border-white/5 hover:border-white/10 transition-all"
                      >
                        <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 rounded-lg shrink-0 w-fit">
                          {hl.timestamp}
                        </span>
                        <p className="text-gray-300 font-medium">{hl.point}</p>
                      </motion.div>
                    ))}
                  </div>
                </section>

                {/* Deep Dive */}
                <section className="mb-12 relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                      <Search className="w-4 h-4 text-emerald-400" />
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">
                      Deep Dive Analysis
                    </h2>
                  </div>
                  <div className="text-gray-300 leading-loose bg-white/[0.03] p-8 rounded-[32px] border border-white/5 whitespace-pre-wrap font-medium shadow-inner">
                    {summary.deepDive}
                  </div>
                </section>

                {/* Actionables */}
                <section className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                      <ChevronRight className="w-4 h-4 text-orange-400" />
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-orange-400">
                      Actionables & Tools
                    </h2>
                  </div>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {summary.actionables.map((action, idx) => (
                      <motion.li 
                        whileHover={{ scale: 1.02 }}
                        key={idx} 
                        className="flex items-center gap-4 bg-gradient-to-r from-orange-500/10 to-transparent p-4 rounded-2xl border border-orange-500/20"
                      >
                        <div className="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)] shrink-0"></div>
                        <span className="text-gray-200 font-medium">{action}</span>
                      </motion.li>
                    ))}
                  </ul>
                </section>
                
              </div>
            </motion.div>
          ) : (
            <div className="h-[700px] border border-dashed border-white/10 rounded-[40px] flex flex-col items-center justify-center text-gray-500 bg-white/[0.02]">
              <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6 border border-white/10">
                <Sparkles className="w-10 h-10 opacity-40 text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-400 mb-2">Ready to Analyze</h2>
              <p className="text-sm">Paste a YouTube URL above to generate a comprehensive summary</p>
            </div>
          )}
        </motion.div>

      </main>
    </div>
  );
}
