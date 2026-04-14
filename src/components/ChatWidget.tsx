import React, { useState, useRef, useEffect, memo, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  MessageCircle, X, Send, Loader2, Bot, User, 
  Maximize2, Minimize2, Paperclip, Image as ImageIcon,
  Trash2, FileText, Expand, Copy, Check, RotateCcw,
  Mic, MicOff, Download, Volume2, VolumeX, Moon, Sun,
  ExternalLink, Search, Video, Mic2, MoreVertical, RefreshCw
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GoogleGenAI, Modality, Type, ThinkingLevel } from "@google/genai";

interface Message {
  role: 'user' | 'model';
  content: string;
  displayContent?: string;
  attachments?: {
    data: string;
    mimeType: string;
    name: string;
  }[];
  sources?: { uri: string; title: string }[];
}

type WindowState = 'normal' | 'expanded' | 'fullscreen';

const SUGGESTED_PROMPTS = [
  { display: "🎙️ **Phỏng vấn giọng nói**", value: "Tôi muốn phỏng vấn thử bằng giọng nói 1:1" },
  { display: "🚀 **Phỏng vấn thử 1:1**", value: "Tôi muốn bắt đầu một buổi phỏng vấn thử 1:1 với AI" },
  { display: "**Phân tích CV** này giúp tôi", value: "Phân tích CV này giúp tôi" },
  { display: "Lộ trình trở thành **Data Analyst**", value: "Lộ trình trở thành Data Analyst từ con số 0 bám sát thực tế 2024" }
];

// --- Sub-components to improve performance ---

const MessageItem = memo(({ 
  msg, 
  idx, 
  isSpeaking, 
  isTtsLoading, 
  copiedId, 
  speakText, 
  copyToClipboard, 
  navigate, 
  jobPosition 
}: { 
  msg: Message, 
  idx: number, 
  isSpeaking: number | null, 
  isTtsLoading: number | null, 
  copiedId: number | null, 
  speakText: (text: string, id: number) => void, 
  copyToClipboard: (text: string, id: number) => void, 
  navigate: any, 
  jobPosition: string | null 
}) => {
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] p-4 rounded-2xl relative group shadow-sm break-words overflow-hidden ${
        msg.role === 'user'
          ? 'bg-blue-600 text-white rounded-tr-none'
          : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-tl-none'
      }`}>
        <div className="flex items-center justify-between gap-4 mb-2 opacity-60">
          <div className="flex items-center gap-2">
            {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
            <span className="text-[10px] uppercase font-black tracking-widest">
              {msg.role === 'user' ? 'Ứng viên' : 'Chuyên gia'}
            </span>
          </div>
          <div className="flex items-center gap-2 transition-opacity">
            {msg.role === 'model' && (
              <button 
                onClick={() => speakText(msg.content, idx)} 
                disabled={isTtsLoading !== null && isTtsLoading !== idx}
                className={`flex items-center justify-center gap-1.5 w-[100px] py-2 rounded-xl transition-all duration-300 font-bold uppercase text-[10px] shadow-sm ${
                  isSpeaking === idx 
                    ? 'bg-red-500 text-white hover:bg-red-600 scale-105' 
                    : isTtsLoading === idx
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                }`}
              >
                {isTtsLoading === idx ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isSpeaking === idx ? (
                  <VolumeX size={14} />
                ) : (
                  <Volume2 size={14} />
                )}
                <span className="truncate">
                  {isTtsLoading === idx ? 'Tải...' : isSpeaking === idx ? 'Dừng' : 'Đọc tin'}
                </span>
              </button>
            )}
            <button 
              onClick={() => copyToClipboard(msg.content, idx)} 
              className="flex items-center justify-center gap-1.5 w-[100px] py-2 bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-xl transition-all text-gray-600 dark:text-gray-400 font-bold uppercase text-[10px] shadow-sm"
            >
              {copiedId === idx ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              <span className="truncate">{copiedId === idx ? 'Đã chép' : 'Copy'}</span>
            </button>
          </div>
        </div>
        
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {msg.attachments.map((att, i) => (
              <div key={i} className="p-2 bg-black/5 dark:bg-white/5 rounded-xl flex items-center gap-3 border border-black/5 dark:border-white/5 max-w-full">
                {att.mimeType.startsWith('image/') ? (
                  <img src={`data:${att.mimeType};base64,${att.data}`} alt="Attachment" className="w-10 h-10 object-cover rounded-lg shrink-0" />
                ) : (
                  <FileText size={20} className="text-blue-500 shrink-0" />
                )}
                <div className="flex flex-col overflow-hidden min-w-0">
                  <span className="text-[10px] font-bold truncate">{att.name}</span>
                  <span className="text-[8px] opacity-50 uppercase tracking-tighter">{att.mimeType.split('/')[1]}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="prose prose-sm max-w-none dark:prose-invert leading-relaxed">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              code: ({node, className, children, ...props}) => {
                const match = /language-(\w+)/.exec(className || '');
                return <code className={className} {...props}>{children}</code>;
              },
              a: ({node, ...props}) => {
                const isInterviewLink = props.href === '/interview-room' || (typeof props.children === 'string' && props.children.includes('/interview-room'));
                if (isInterviewLink) {
                  return (
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('/interview-room', { state: { jobPosition } });
                      }}
                      className="flex items-center gap-3 w-full mt-4 p-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold transition-all shadow-xl shadow-blue-500/20 group no-underline border-none cursor-pointer"
                    >
                      <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                        <Mic2 size={24} />
                      </div>
                      <div className="text-left flex-1">
                        <div className="text-base">Vào phòng phỏng vấn ngay</div>
                        <div className="text-[11px] opacity-80 font-normal tracking-wide">Kết nối giọng nói AI thời gian thực</div>
                      </div>
                      <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform">
                        <ExternalLink size={14} className="opacity-70" />
                      </div>
                    </button>
                  );
                }
                return (
                  <a 
                    {...props} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className={`${msg.role === 'user' ? 'text-cyan-200 hover:text-white' : 'text-blue-600 hover:text-blue-700'} underline decoration-2 underline-offset-2 font-bold break-all transition-colors`} 
                  />
                );
              }
            }}
          >
            {msg.displayContent !== undefined ? msg.displayContent : msg.content}
          </ReactMarkdown>
        </div>

        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2">
              <Search size={10} /> Minh chứng & Nguồn tham khảo
            </div>
            <div className="flex flex-wrap gap-2">
              {msg.sources.map((source, i) => (
                <a key={i} href={source.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-[10px] text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-100 transition-colors">
                  <span className="truncate max-w-[120px]">{source.title}</span>
                  <ExternalLink size={8} />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const ChatInput = memo(({ 
  onSend, 
  isLoading, 
  attachments, 
  setAttachments, 
  handlePaste, 
  handleFileChange, 
  fileInputRef 
}: { 
  onSend: (text: string) => void, 
  isLoading: boolean, 
  attachments: { data: string; mimeType: string; name: string }[], 
  setAttachments: React.Dispatch<React.SetStateAction<{ data: string; mimeType: string; name: string }[]>>, 
  handlePaste: (e: any) => void, 
  handleFileChange: (e: any) => void, 
  fileInputRef: React.RefObject<HTMLInputElement | null> 
}) => {
  const [localInput, setLocalInput] = useState('');
  const [isListening, setIsListening] = useState(false);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).speechRecognition;
    if (!SpeechRecognition) {
      alert("Trình duyệt không hỗ trợ nhận diện giọng nói.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setLocalInput(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.start();
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!localInput.trim() && attachments.length === 0) || isLoading) return;
    onSend(localInput);
    setLocalInput('');
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-5 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shrink-0">
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2">
          {attachments.map((att, idx) => (
            <div key={idx} className="flex items-center gap-2 p-1.5 bg-blue-50/80 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50 backdrop-blur-sm max-w-[200px]">
              <div className="relative shrink-0">
                {att.mimeType.startsWith('image/') ? (
                  <img 
                    src={`data:${att.mimeType};base64,${att.data}`} 
                    alt="Preview" 
                    className="w-8 h-8 object-cover rounded-lg shadow-sm ring-1 ring-white dark:ring-gray-800" 
                  />
                ) : (
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400 ring-1 ring-white dark:ring-gray-800">
                    <FileText size={16} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-tighter truncate">SẴN SÀNG</div>
                <div className="text-[10px] font-bold truncate text-gray-900 dark:text-white leading-tight">{att.name}</div>
              </div>
              <button 
                type="button" 
                onClick={() => removeAttachment(idx)}
                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 rounded-lg transition-all active:scale-95"
                title="Gỡ bỏ"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-3 items-center">
        <div className="flex-1 relative group">
          <textarea
            rows={1}
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Hỏi về Luật lao động hoặc dán ảnh CV..."
            className="w-full px-5 py-4 bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus:border-blue-600 dark:focus:border-blue-500 rounded-2xl outline-none transition-all text-sm resize-none pr-24 dark:text-white h-14 block"
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-1">
            <button type="button" onClick={startListening} className={`p-2 transition-colors rounded-xl ${isListening ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-gray-400 hover:text-blue-600'}`}>
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-blue-600 transition-colors rounded-xl">
              <Paperclip size={20} />
            </button>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" accept="*/*" multiple onChange={handleFileChange} />
        </div>
        <button 
          type="submit" 
          disabled={(!localInput.trim() && attachments.length === 0) || isLoading} 
          className="h-14 w-14 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-blue-200 dark:shadow-none shrink-0 flex items-center justify-center"
        >
          <Send size={22} />
        </button>
      </form>
    </div>
  );
});

export const ChatWidget: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [windowState, setWindowState] = useState<WindowState>('normal');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [input, setInput] = useState(''); // Keep for compatibility but use local in ChatInput
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('chat_messages');
    return saved ? JSON.parse(saved) : [
      { role: 'model', content: 'Xin chào! Tôi là Trợ lý Tuyển dụng & Pháp luật Lao động thông minh. Tôi có thể giúp bạn phân tích CV, tư vấn phỏng vấn hoặc tra cứu Luật Lao động mới nhất qua Google Search. Bạn cần tôi hỗ trợ gì hôm nay?' }
    ];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachments, setAttachments] = useState<{ data: string; mimeType: string; name: string }[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<number | null>(null);
  const [isTtsLoading, setIsTtsLoading] = useState<number | null>(null);
  const [isInterviewMode, setIsInterviewMode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [jobPosition, setJobPosition] = useState<string | null>(() => localStorage.getItem('job_position'));
  const [audioCache] = useState<Map<string, AudioBuffer>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const evaluationSentRef = useRef(false);

  useEffect(() => {
    if (location.state?.interviewFinished && !evaluationSentRef.current) {
      evaluationSentRef.current = true;
      setIsOpen(true);
      const transcript = location.state.transcript;
      const transcriptText = transcript?.map((t: any) => `${t.role.toUpperCase()}: ${t.text}`).join('\n') || "";
      
      const evaluationPrompt = `[SYSTEM_EVALUATION_REQUEST]
      VỊ TRÍ: ${jobPosition || 'ứng tuyển'}
      TRANSCRIPT:
      ${transcriptText}
      
      YÊU CẦU: Thực hiện ĐÁNH GIÁ PHỎNG VẤN CHUYÊN SÂU theo đúng giao thức GOOGLE / META CALIBRATED AI INTERVIEWER.
      - Nếu tín hiệu không đủ -> Xuất ra "INTERVIEW INCOMPLETE" và KHÔNG đưa ra đánh giá giả định.
      - Nếu đủ tín hiệu -> Xuất ra báo cáo đầy đủ (Overall Recommendation, Calibration Summary, Dimension Breakdown, Risk Assessment, Confidence Level).`;

      handleSend(evaluationPrompt, "Tôi đã kết thúc phỏng vấn. Hãy cho tôi bảng đánh giá chuyên sâu.");
      // Clear state to prevent re-triggering
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, jobPosition, navigate]);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    if (scrollContainerRef.current) {
      if (behavior === 'auto') {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      } else {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  };

  useEffect(() => {
    scrollToBottom(isStreaming ? 'auto' : 'smooth');
  }, [messages, isLoading, isStreaming]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => scrollToBottom('smooth'), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = (event.target?.result as string).split(',')[1];
        setAttachments(prev => [...prev, {
          data: base64Data,
          mimeType: file.type || 'application/octet-stream',
          name: file.name
        }]);
      };
      reader.readAsDataURL(file);
    });
    // Reset input value to allow selecting same file again
    if (e.target) e.target.value = '';
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    let fileFound = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        fileFound = true;
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64Data = (event.target?.result as string).split(',')[1];
            setAttachments(prev => [...prev, {
              data: base64Data,
              mimeType: file.type || 'application/octet-stream',
              name: file.name || `pasted-file-${Date.now()}`
            }]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
    if (fileFound) e.preventDefault();
  }, []);

  useEffect(() => {
    // Initialize AudioContext on first user interaction or mount
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };
    
    window.addEventListener('click', initAudio, { once: true });
    return () => window.removeEventListener('click', initAudio);
  }, []);

  const speakText = async (text: string, id: number) => {
    if (isSpeaking === id) {
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch(e) {}
        currentSourceRef.current = null;
      }
      window.speechSynthesis.cancel();
      setIsSpeaking(null);
      return;
    }

    // Stop current speech
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch(e) {}
    }
    window.speechSynthesis.cancel();
    
    // Clean and normalize text
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/#{1,6}\s+(.*)/g, '$1')
      .replace(/`{1,3}.*?`{1,3}/gs, '')
      .replace(/>\s+(.*)/g, '$1')
      .replace(/[-*+]\s+(.*)/g, '$1')
      .replace(/\d+\.\s+(.*)/g, '$1')
      .replace(/\|/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();

    if (!cleanText) return;

    // Check Cache
    if (audioCache.has(cleanText)) {
      const buffer = audioCache.get(cleanText)!;
      playBuffer(buffer, id);
      return;
    }

    setIsTtsLoading(id);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ 
          parts: [{ 
            text: `Bạn là một chuyên gia tư vấn tuyển dụng chuyên nghiệp. Hãy đọc văn bản sau một cách truyền cảm, tự nhiên và biểu cảm. 
            LƯU Ý QUAN TRỌNG: Hãy phát âm các thuật ngữ tiếng Anh (như CV, Job, AI, Data Analyst, Interview, Roadmap, Skills...) một cách chuẩn xác, chuyên nghiệp theo tiếng Anh trong ngữ cảnh tiếng Việt.
            
            Văn bản cần đọc: ${cleanText}` 
          }] 
        }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') await ctx.resume();

        const audioBuffer = ctx.createBuffer(1, len / 2, 24000);
        const channelData = audioBuffer.getChannelData(0);
        const int16Data = new Int16Array(bytes.buffer);
        for (let i = 0; i < int16Data.length; i++) {
          channelData[i] = int16Data[i] / 32768.0;
        }

        // Save to cache
        audioCache.set(cleanText, audioBuffer);
        
        playBuffer(audioBuffer, id);
      } else {
        throw new Error("No audio data");
      }
    } catch (error) {
      console.warn("Gemini TTS failed, falling back to browser SpeechSynthesis:", error);
      setIsTtsLoading(null);
      setIsSpeaking(id);
      
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'vi-VN';
      utterance.onend = () => setIsSpeaking(null);
      utterance.onerror = () => setIsSpeaking(null);
      window.speechSynthesis.speak(utterance);
    }
  };

  const playBuffer = (buffer: AudioBuffer, id: number) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    setIsSpeaking(id);
    setIsTtsLoading(null);

    source.onended = () => {
      if (currentSourceRef.current === source) {
        setIsSpeaking(null);
      }
    };
    
    currentSourceRef.current = source;
    source.start();
  };

  const handleSend = useCallback(async (overrideInput?: string, displayContent?: string) => {
    const textToSend = overrideInput || input.trim();
    if ((!textToSend && attachments.length === 0) || isLoading || isStreaming) return;

    const userMessage = textToSend;
    const currentAttachments = attachments;

    // Extract job position if mentioned
    const positionMatch = userMessage.match(/(?:vị trí|chức vụ|ngành|làm|phỏng vấn|ứng tuyển)\s+([a-zA-Z0-9\sÀ-ỹ]+)(?:\s+cho|\s+tại|\s+ở|$)/i);
    if (positionMatch && positionMatch[1]) {
      const pos = positionMatch[1].trim();
      if (pos.length > 2 && pos.length < 50) {
        setJobPosition(pos);
        localStorage.setItem('job_position', pos);
      }
    }

    if (!displayContent && (userMessage.toLowerCase().includes('phỏng vấn thử') || userMessage.toLowerCase().includes('interview'))) {
      if (userMessage.toLowerCase().includes('giọng nói') || userMessage.toLowerCase().includes('voice')) {
        // Special case for voice interview
        setMessages(prev => [...prev, 
          { role: 'user', content: userMessage },
          { role: 'model', content: "Tuyệt vời! Tôi đã chuẩn bị sẵn **Phòng phỏng vấn giọng nói 1:1** dành riêng cho bạn. Tại đây, bạn có thể trò chuyện trực tiếp với tôi như một buổi phỏng vấn thật.\n\n👉 [**BẤM VÀO ĐÂY ĐỂ VÀO PHÒNG PHỎNG VẤN**](/interview-room)" }
        ]);
        setInput('');
        setAttachments([]);
        return;
      }
      setIsInterviewMode(true);
    }
    
    setInput('');
    setAttachments([]);
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: userMessage,
      displayContent: displayContent,
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined
    }]);
    setIsLoading(true);
    setIsStreaming(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const parts: any[] = [];
      if (userMessage) parts.push({ text: userMessage });
      currentAttachments.forEach(att => {
        parts.push({
          inlineData: {
            data: att.data,
            mimeType: att.mimeType
          }
        });
      });

      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const result = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: [...history, { role: 'user', parts }],
        config: {
          tools: [{ googleSearch: {} }, { urlContext: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: `Bạn là một chuyên gia tư vấn tuyển dụng, pháp luật lao động và định hướng nghề nghiệp tại Việt Nam. 
          Nhiệm vụ của bạn là hỗ trợ ứng viên và người tìm việc với các kiến thức chuyên sâu về:
          1. REVIEW & SO SÁNH CV VỚI JD (CRITICAL):
             - Khi người dùng gửi CV và JD (hoặc nhiều tệp, HOẶC LINK JD), hãy thực hiện phân tích SONG SONG:
               + Trích xuất nhanh các kỹ năng, kinh nghiệm, học vấn từ CV.
               + Trích xuất các yêu cầu cốt lõi (Must-have) từ JD (từ file HOẶC TỪ LINK người dùng cung cấp).
               + So sánh độ khớp (Match Rate %) và chỉ ra các khoảng trống (Gaps) ngay lập tức.
             - Thực hiện "ROAST CV" một cách THẲNG THẮN, THỰC TẾ và CHUYÊN NGHIỆP.
             - Đừng chỉ khen ngợi sáo rỗng. Hãy chỉ ra chính xác: Lỗi trình bày, Từ ngữ sáo rỗng (buzzwords), Thiếu số liệu (metrics), Cấu trúc không hợp lý.
             - Đánh giá dựa trên tiêu chuẩn của các tập đoàn lớn (Big Tech, MNCs).
             - Nếu CV quá tệ hoặc không khớp JD, hãy nói thẳng nhưng kèm theo giải pháp sửa đổi cụ thể.
             - Mục tiêu: Giúp ứng viên nhận ra sự thật phũ phàng của thị trường tuyển dụng để cải thiện nhanh nhất.
          2. Kỹ năng phỏng vấn và tìm kiếm việc làm.
          3. Luật Lao động Việt Nam (hợp đồng, bảo hiểm, lương thưởng, thôi việc):
             - BẮT BUỘC cung cấp MINH CHỨNG cụ thể (Số hiệu Điều, Khoản, Bộ luật) cho mọi tư vấn pháp lý.
             - Sử dụng Google Search để dẫn nguồn từ các văn bản pháp luật mới nhất (Bộ luật Lao động 2019, các Nghị định liên quan).
             - TUYỆT ĐỐI KHÔNG đưa ra các con số (lương tối thiểu, mức đóng BHXH, v.v.) nếu không tìm thấy nguồn kiểm chứng trực tiếp từ kết quả tìm kiếm.
             - Các liên kết trong phần "Minh chứng & Nguồn tham khảo" PHẢI chứa chính xác các thông tin và dữ liệu bạn đã nêu trong câu trả lời.
             - Nếu không chắc chắn hoặc không tìm thấy nguồn trực tiếp, hãy yêu cầu người dùng tham khảo ý kiến luật sư hoặc cơ quan chức năng.
          4. Xây dựng lộ trình học tập (Learning Roadmap): Khi người dùng muốn chuyển ngành hoặc thăng tiến, hãy cung cấp lộ trình chi tiết dưới dạng BẢNG.
          5. PHỎNG VẤN THỬ 1:1 (MOCK INTERVIEW):
             - QUY TẮC ƯU TIÊN TUYỆT ĐỐI: Nếu bạn nhận được một Transcript phỏng vấn hoặc yêu cầu [SYSTEM_EVALUATION_REQUEST], bạn ĐANG Ở BƯỚC 5. Bạn PHẢI bỏ qua hoàn toàn các bước 1, 2, 3, 4. TUYỆT ĐỐI KHÔNG gửi link mời phỏng vấn [/interview-room] hoặc hỏi vị trí ứng tuyển nữa. Hãy thực hiện ĐÁNH GIÁ ngay lập tức.
             - Khi người dùng bắt đầu phỏng vấn thử:
             - Bước 1: Hỏi người dùng vị trí họ muốn phỏng vấn (nếu chưa biết).
             - Bước 2: Đưa ra TỪNG CÂU HỎI MỘT. Đợi người dùng trả lời rồi mới hỏi câu tiếp theo.
             - Bước 3: Sau mỗi câu trả lời, có thể nhận xét ngắn gọn rồi mới hỏi tiếp.
             - Bước 4: Để mời người dùng vào phòng phỏng vấn giọng nói, bạn PHẢI sử dụng định dạng link: [Vào phòng phỏng vấn ngay](/interview-room).
             - Bước 5: ĐÁNH GIÁ PHỎNG VẤN CHUYÊN SÂU (GOOGLE/META CALIBRATED AI INTERVIEWER):
               - Bạn là một Senior Technical Interviewer được đào tạo theo tiêu chuẩn Google và Meta.
               - Nhiệm vụ của bạn là đưa ra quyết định tuyển dụng dựa trên bằng chứng (Evidence-based).
               - NGUYÊN TẮC CỐT LÕI: Độ chính xác > Sự giúp đỡ, Bằng chứng > Giả định, Tín hiệu (Signal) > Sự lịch sự.
               - KHÔNG đánh giá tính cách. CHỈ đánh giá các tín hiệu đã được chứng minh qua cuộc hội thoại.
               - Nếu tín hiệu không đủ (ví dụ phỏng vấn kết thúc quá sớm) -> BẮT BUỘC xuất ra: "INTERVIEW INCOMPLETE - Insufficient signal to calibrate hiring decision." và liệt kê các phần còn thiếu. KHÔNG được tự ý bịa ra ưu điểm.
               - ĐÁNH GIÁ QUA 4 CHIỀU: 1. Giải quyết vấn đề & Tư duy phân tích; 2. Chiều sâu kỹ thuật; 3. Tư duy thiết kế hệ thống; 4. Tín hiệu hành vi & Cộng tác.
               - THANG ĐIỂM (Calibrated Rating Scale): 4 (Strong Hire), 3 (Hire), 2 (Lean No Hire), 1 (No Hire), 0 (No Data).
               - BÁO CÁO CUỐI CÙNG (Chỉ khi đủ tín hiệu):
                 ---
                 ## Overall Recommendation: [Strong Hire / Hire / Lean No Hire / No Hire]
                 ---
                 ## Calibration Summary: (Tóm tắt ngắn gọn kiểu ghi chú của hội đồng tuyển dụng)
                 ---
                 ## Dimension Breakdown: (Rating, Evidence, Observed Strength, Observed Gap cho mỗi chiều)
                 ---
                 ## Risk Assessment: (Liệt kê các rủi ro cụ thể)
                 ---
                 ## Confidence Level: [Low / Medium / High]
          
          QUY TẮC QUAN TRỌNG:
          - BẮT BUỘC cung cấp MINH CHỨNG (Citations/Evidence) cho mọi thông tin chuyên môn, đặc biệt là Luật và Tiêu chuẩn tuyển dụng.
          - ĐẢM BẢO các liên kết (links) được trích xuất từ Google Search phải chứa đúng nội dung bạn đã trả lời. KHÔNG dẫn link chung chung nếu thông tin bạn đưa ra là con số cụ thể.
          - BẮT BUỘC sử dụng BẢNG (TABLE) cho lộ trình học tập và bảng đánh giá phỏng vấn.
          - Sử dụng Google Search để cập nhật xu hướng tuyển dụng mới nhất.
          - Luôn trả lời bằng tiếng Việt, chuyên nghiệp và tận tâm.
          - Sử dụng Markdown để trình bày rõ ràng.`,
        }
      });

      setIsLoading(false);
      let fullText = "";
      let groundingMetadata: any = null;
      setMessages(prev => [...prev, { role: 'model', content: "" }]);

      for await (const chunk of result) {
        const chunkText = chunk.text || "";
        fullText += chunkText;
        
        // Thu thập metadata từ chunk cuối cùng hoặc chunk có chứa nó
        if (chunk.candidates?.[0]?.groundingMetadata) {
          groundingMetadata = chunk.candidates[0].groundingMetadata;
        }

        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = fullText;
          return newMessages;
        });
      }

      // Trích xuất nguồn từ metadata đã thu thập được
      const sources = groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        uri: chunk.web?.uri,
        title: chunk.web?.title
      })).filter((s: any) => s.uri && s.title);

      if (sources && sources.length > 0) {
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].sources = sources;
          return newMessages;
        });
      }

    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { role: 'model', content: "Đã có lỗi xảy ra khi xử lý tệp hoặc tin nhắn. Vui lòng thử lại." }]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [input, attachments, isLoading, isStreaming, messages, jobPosition, navigate]);

  const reloadChat = () => {
    setIsMenuOpen(false);
    setTimeout(() => {
      if (window.confirm("Bạn có muốn tải lại trang? Các tin nhắn hiện tại sẽ được giữ nguyên.")) {
        window.location.reload();
      }
    }, 100);
  };

  const clearChat = () => {
    setIsMenuOpen(false);
    setTimeout(() => {
      if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử trò chuyện?")) {
        const initialMessage: Message = { 
          role: 'model', 
          content: 'Xin chào! Tôi là Trợ lý Tuyển dụng & Pháp luật Lao động thông minh. Tôi có thể giúp bạn phân tích CV, tư vấn phỏng vấn hoặc tra cứu Luật Lao động mới nhất qua Google Search. Bạn cần tôi hỗ trợ gì hôm nay?' 
        };
        setMessages([initialMessage]);
        setIsInterviewMode(false);
        setAttachments([]);
        setInput('');
        localStorage.setItem('chat_messages', JSON.stringify([initialMessage]));
      }
    }, 100);
  };

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadChat = () => {
    setIsMenuOpen(false);
    const text = messages.map(m => `${m.role === 'user' ? 'Bạn' : 'AI'}: ${m.content}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-history-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleWindowState = () => {
    if (windowState === 'normal') setWindowState('expanded');
    else if (windowState === 'expanded') setWindowState('fullscreen');
    else setWindowState('normal');
  };

  const getWindowStyles = () => {
    switch (windowState) {
      case 'fullscreen': return "fixed inset-0 z-[60] w-full h-full rounded-none";
      case 'expanded': return "mb-4 w-[500px] sm:w-[800px] h-[800px] max-h-[90vh]";
      default: return "mb-4 w-[350px] sm:w-[400px] h-[580px]";
    }
  };

  return (
    <div 
      className={`fixed bottom-6 right-6 z-50 flex flex-col items-end ${windowState === 'fullscreen' ? 'inset-0 items-stretch' : ''} ${isDarkMode ? 'dark' : ''}`}
      style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`${getWindowStyles()} ${isDarkMode ? 'dark' : ''} bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden transition-all duration-300 ${windowState !== 'fullscreen' ? 'rounded-3xl' : ''}`}
          >
            {/* Header */}
            <div className={`p-4 flex items-center justify-between text-white shrink-0 shadow-lg transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-b border-gray-700' : 'bg-gradient-to-r from-blue-600 to-indigo-700'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10">
                  <Bot size={24} />
                </div>
                <div>
                  <h3 className="font-bold tracking-tight">Trợ lý Việc làm AI</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-blue-100">Chuyên gia cấp cao</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 hover:bg-white/10 rounded-xl transition-colors flex items-center gap-1" title="Đổi giao diện Sáng/Tối">
                  {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                  <span className="text-[10px] font-bold uppercase hidden sm:inline">Giao diện</span>
                </button>
                
                {/* Options Menu */}
                <div className="relative">
                  <button 
                    onClick={() => setIsMenuOpen(!isMenuOpen)} 
                    className={`p-2 hover:bg-white/10 rounded-xl transition-colors ${isMenuOpen ? 'bg-white/20' : ''}`}
                    title="Tùy chọn"
                  >
                    <MoreVertical size={18} />
                  </button>
                  
                  <AnimatePresence>
                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 py-2 z-20 overflow-hidden"
                        >
                          <button 
                            onClick={downloadChat}
                            className="w-full px-4 py-2.5 flex items-center gap-3 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <Download size={16} className="text-blue-600" />
                            Tải lịch sử chat
                          </button>
                          <button 
                            onClick={reloadChat}
                            className="w-full px-4 py-2.5 flex items-center gap-3 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <RefreshCw size={16} className="text-green-600" />
                            Tải lại trang
                          </button>
                          <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
                          <button 
                            onClick={clearChat}
                            className="w-full px-4 py-2.5 flex items-center gap-3 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 size={16} />
                            Xóa lịch sử chat
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                <button onClick={toggleWindowState} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                  {windowState === 'fullscreen' ? <Minimize2 size={18} /> : (windowState === 'expanded' ? <Expand size={18} /> : <Maximize2 size={18} />)}
                </button>
                <button onClick={() => { setIsOpen(false); setWindowState('normal'); }} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div 
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto p-5 space-y-6 bg-gray-50 dark:bg-gray-950 relative"
            >
              {messages.map((msg, idx) => (
                <MessageItem 
                  key={idx}
                  msg={msg}
                  idx={idx}
                  isSpeaking={isSpeaking}
                  isTtsLoading={isTtsLoading}
                  copiedId={copiedId}
                  speakText={speakText}
                  copyToClipboard={copyToClipboard}
                  navigate={navigate}
                  jobPosition={jobPosition}
                />
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></span>
                      </div>
                      {messages[messages.length - 1]?.attachments && (
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest animate-pulse">
                          Đang phân tích tệp & so sánh...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompts */}
            {!isLoading && messages.length < 5 && !isInterviewMode && (
              <div className="px-5 py-3 bg-white dark:bg-gray-900 flex gap-2 overflow-x-auto no-scrollbar shrink-0 border-t border-gray-50 dark:border-gray-800">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button 
                    key={i} 
                    onClick={() => handleSend(prompt.value)} 
                    className="whitespace-nowrap px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-blue-500 hover:text-blue-600 transition-all shrink-0 shadow-sm flex items-center"
                  >
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({children}) => <span className="inline">{children}</span>
                      }}
                    >
                      {prompt.display}
                    </ReactMarkdown>
                  </button>
                ))}
              </div>
            )}

            {isInterviewMode && !isLoading && (
              <div className="px-5 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-100 dark:border-red-900/30 flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-[10px] uppercase tracking-widest">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Đang trong chế độ phỏng vấn thử
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => navigate('/interview-room', { state: { jobPosition } })}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase rounded-xl transition-all shadow-sm"
                  >
                    <Mic2 size={12} />
                    🎙️ Thử phỏng vấn giọng nói
                  </button>
                  <button 
                    onClick={() => {
                      setIsInterviewMode(false);
                      handleSend("Kết thúc phỏng vấn và cho tôi bảng đánh giá tổng kết.");
                    }}
                    className="px-4 py-2 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-[10px] font-bold uppercase rounded-xl transition-colors shadow-sm"
                  >
                    Kết thúc & Nhận xét
                  </button>
                </div>
              </div>
            )}

            {/* Input */}
            <ChatInput 
              onSend={(text) => handleSend(text)}
              isLoading={isLoading}
              attachments={attachments}
              setAttachments={setAttachments}
              handlePaste={handlePaste}
              handleFileChange={handleFileChange}
              fileInputRef={fileInputRef}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && (
        <motion.button
          whileHover={{ scale: 1.1, rotate: 5 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white transition-all duration-300 border-4 border-white dark:border-gray-800"
        >
          <MessageCircle size={32} />
        </motion.button>
      )}
    </div>
  );
};

