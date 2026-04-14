import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Mic, MicOff, PhoneOff, User, Bot, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';

export const InterviewRoom: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const jobPosition = location.state?.jobPosition || localStorage.getItem('job_position');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [currentAiText, setCurrentAiText] = useState("");
  const [currentUserText, setCurrentUserText] = useState("");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    startInterview();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startInterview = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      // 1. Get Microphone Access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 2. Setup Audio Context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // 3. Connect to Gemini Live
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `Bạn là một Senior Technical Interviewer được đào tạo theo tiêu chuẩn Google và Meta.
          Nhiệm vụ của bạn là thực hiện các cuộc phỏng vấn có cấu trúc, dựa trên tín hiệu (signal-driven) và đưa ra quyết định tuyển dụng dựa trên bằng chứng.
          Bạn phải hoạt động dưới kỷ luật hiệu chuẩn (calibration discipline) nghiêm ngặt.
          Độ chính xác > Sự giúp đỡ, Bằng chứng > Giả định, Tín hiệu > Sự lịch sự.
          
          ${jobPosition ? `BỐI CẢNH: Bạn đang phỏng vấn ứng viên cho vị trí ${jobPosition}.` : ''}
          
          NGUYÊN TẮC CỐT LÕI:
          - Bạn KHÔNG đánh giá tính cách. Bạn đánh giá các tín hiệu (signal) đã được chứng minh.
          - Nếu tín hiệu không đủ -> KHÔNG TUYỂN (DO NOT HIRE).
          
          CẤU TRÚC PHỎNG VẤN:
          1. Xây dựng bối cảnh: Hiểu số năm kinh nghiệm, cấp độ vai trò, chuyên môn lĩnh vực.
          2. Tín hiệu kỹ thuật chuyên sâu: Đưa ra các câu hỏi thích ứng, thăm dò lý luận, đặt câu hỏi tiếp theo, kiểm tra sự đánh đổi (trade-offs), thách thức các giả định.
          3. Kiểm tra áp lực tín hiệu: Đưa ra các tình huống mơ hồ, các ràng buộc xung đột.
          4. Hiệu chuẩn hành vi: Hỏi về cách xử lý xung đột, phản ánh thất bại, ví dụ về quyền sở hữu (ownership). Từ chối các câu trả lời mơ hồ không có ví dụ cụ thể.
          
          QUY TẮC HÀNH VI:
          - Chỉ hỏi MỘT câu hỏi tại một thời điểm.
          - Thúc đẩy việc đưa ra lý luận (reasoning).
          - Thử thách các câu trả lời nông cạn.
          - Khuyến khích tư duy có cấu trúc.
          - Luôn trung lập và chuyên nghiệp. Tránh khen ngợi quá mức.
          
          Bắt đầu cuộc phỏng vấn một cách tự nhiên bằng cách hỏi về dự án có tác động lớn nhất gần đây của ứng viên và quyền sở hữu cụ thể của họ trong đó.`,
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            startStreaming(audioContext, stream);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              queueAudio(base64Audio);
            }

            // Handle Transcription (NLP Feel)
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              const text = message.serverContent.modelTurn.parts[0].text;
              setCurrentAiText(prev => prev + text);
            }

            // Handle User Transcription
            const serverContent = message.serverContent as any;
            if (serverContent?.userTurn?.parts?.[0]?.text) {
              const text = serverContent.userTurn.parts[0].text;
              setCurrentUserText(text);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              setAiSpeaking(false);
              setCurrentAiText("");
            }

            // When a turn is complete, add to transcript
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData === undefined && currentAiText) {
              setTranscript(prev => [...prev.slice(-4), { role: 'ai', text: currentAiText }]);
              setCurrentAiText("");
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Lỗi kết nối âm thanh. Vui lòng thử lại.");
            setIsConnecting(false);
          },
          onclose: () => {
            setIsConnected(false);
          }
        }
      });
      sessionRef.current = session;

    } catch (err) {
      console.error("Failed to start interview:", err);
      setError("Không thể truy cập microphone hoặc lỗi kết nối.");
      setIsConnecting(false);
    }
  };

  const startStreaming = (audioContext: AudioContext, stream: MediaStream) => {
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (isMuted || !sessionRef.current) return;

      const inputData = e.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(inputData.length);
      let isSilent = true;
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        if (Math.abs(s) > 0.01) isSilent = false;
      }

      setUserSpeaking(!isSilent);

      // Send to Gemini
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
      sessionRef.current.sendRealtimeInput({
        audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
      });
    };
  };

  const queueAudio = (base64Data: string) => {
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pcmData = new Int16Array(bytes.buffer);
    audioQueueRef.current.push(pcmData);
    
    if (!isPlayingRef.current) {
      playNextInQueue();
    }
  };

  const playNextInQueue = async () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      setAiSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setAiSpeaking(true);
    const pcmData = audioQueueRef.current.shift()!;
    
    const audioBuffer = audioContextRef.current.createBuffer(1, pcmData.length, 16000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 32768.0;
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => playNextInQueue();
    source.start();
  };

  const handleEndInterview = () => {
    cleanup();
    navigate('/', { state: { interviewFinished: true, transcript } });
  };

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center z-[100] text-white font-sans overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Sparkles className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">AI Interview Room</h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-[10px] uppercase tracking-widest font-bold opacity-60">
                {isConnected ? 'Live Session' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>
        
        <button 
          onClick={handleEndInterview}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-xl transition-all font-bold text-xs uppercase tracking-widest"
        >
          <PhoneOff size={16} />
          End Interview
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center gap-12 px-6">
        <div className="relative flex items-center justify-center gap-16 md:gap-32 w-full">
          {/* AI Avatar */}
          <div className="flex flex-col items-center gap-6">
            <div className={`relative w-32 h-32 md:w-48 md:h-48 rounded-full flex items-center justify-center transition-all duration-500 ${aiSpeaking ? 'bg-blue-500/20 scale-110' : 'bg-gray-900 border border-white/10'}`}>
              <AnimatePresence>
                {aiSpeaking && (
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.2, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="absolute inset-0 rounded-full border-2 border-blue-500/50"
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                  />
                )}
              </AnimatePresence>
              <Bot size={aiSpeaking ? 64 : 48} className={`transition-all duration-500 ${aiSpeaking ? 'text-blue-400' : 'text-gray-500'}`} />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-lg">AI Interviewer</h3>
              <p className="text-xs opacity-50 uppercase tracking-widest font-medium">Professional Recruiter</p>
            </div>
          </div>

          {/* Connection Line */}
          <div className="hidden md:flex items-center gap-2 opacity-20">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full bg-white ${aiSpeaking || userSpeaking ? 'animate-bounce' : ''}`} style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>

          {/* User Avatar */}
          <div className="flex flex-col items-center gap-6">
            <div className={`relative w-32 h-32 md:w-48 md:h-48 rounded-full flex items-center justify-center transition-all duration-500 ${userSpeaking && !isMuted ? 'bg-purple-500/20 scale-110' : 'bg-gray-900 border border-white/10'}`}>
              <AnimatePresence>
                {userSpeaking && !isMuted && (
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.2, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="absolute inset-0 rounded-full border-2 border-purple-500/50"
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                  />
                )}
              </AnimatePresence>
              <User size={userSpeaking && !isMuted ? 64 : 48} className={`transition-all duration-500 ${userSpeaking && !isMuted ? 'text-purple-400' : 'text-gray-500'}`} />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-lg">Candidate</h3>
              <p className="text-xs opacity-50 uppercase tracking-widest font-medium">You</p>
            </div>
          </div>
        </div>

        {/* Status & Controls */}
        <div className="w-full max-w-2xl flex flex-col items-center gap-8">
          {/* Real-time Transcription (NLP Display) */}
          <div className="w-full min-h-[100px] bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-50">NLP Real-time Transcript</span>
            </div>
            
            <div className="space-y-3">
              {transcript.map((t, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }} 
                  animate={{ opacity: 0.5, x: 0 }} 
                  key={i} 
                  className={`text-xs ${t.role === 'ai' ? 'text-blue-300' : 'text-purple-300'}`}
                >
                  <span className="font-bold uppercase mr-2">{t.role}:</span>
                  {t.text}
                </motion.div>
              ))}
              
              {currentUserText && (
                <div className="text-sm text-purple-400 font-medium">
                  <span className="font-bold uppercase mr-2">You:</span>
                  {currentUserText}
                </div>
              )}
              
              {currentAiText && (
                <div className="text-sm text-blue-400 font-medium">
                  <span className="font-bold uppercase mr-2">AI:</span>
                  {currentAiText}
                </div>
              )}

              {!currentUserText && !currentAiText && transcript.length === 0 && (
                <p className="text-xs text-white/20 italic">Đang chờ cuộc hội thoại bắt đầu...</p>
              )}
            </div>
          </div>

          {isConnecting ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-blue-500" size={32} />
              <p className="text-sm font-medium opacity-70">Preparing your interview room...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="text-red-500" size={32} />
              <p className="text-sm font-medium text-red-400">{error}</p>
              <button onClick={startInterview} className="px-6 py-2 bg-white text-black rounded-xl font-bold text-xs uppercase tracking-widest">Retry</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6 w-full">
              <div className="h-12 flex items-center justify-center">
                {aiSpeaking ? (
                  <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-blue-400 font-medium italic">AI is speaking...</motion.p>
                ) : userSpeaking && !isMuted ? (
                  <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-purple-400 font-medium italic">Listening to you...</motion.p>
                ) : (
                  <p className="text-gray-500 font-medium italic">Silence...</p>
                )}
              </div>

              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                  {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-0 left-0 right-0 p-8 text-center">
        <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold">
          Powered by Gemini 3.1 Flash Live • Real-time Voice Interaction
        </p>
      </div>
    </div>
  );
};
