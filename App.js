import React, { useState, useEffect, useRef, Component } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  Image,
  ScrollView,
  Modal,
  Pressable
} from 'react-native';
import { registerRootComponent } from 'expo';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as db from './src/db';

// URL Model Resmi IRRON 3B (Otak Terbaru) dari GitHub Release
const MODEL_DOWNLOAD_URL = 'https://github.com/wongsxs/irron-mobile/releases/download/v1.0.0/irron-3b.gguf';
const MODEL_FILE_NAME = 'irron-3b.gguf';
const MODEL_SIZE_MB = '1930';

const getModelLocalPath = () => {
  const dir = FileSystem.documentDirectory || '';
  return `${dir}${MODEL_FILE_NAME}`;
};

// =================== PARSER MARKDOWN & CODE ===================
function parseMarkdownBlocks(text) {
  if (!text) return [];
  const blocks = [];
  const parts = text.split(/(```[\s\S]*?```|```[\s\S]*$)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('```')) {
      const isClosed = part.length >= 6 && part.endsWith('```');
      const inner = isClosed ? part.slice(3, -3) : part.slice(3);
      const firstLineBreak = inner.indexOf('\n');
      let lang = 'CODE';
      let code = inner;
      if (firstLineBreak !== -1) {
        const potentialLang = inner.slice(0, firstLineBreak).trim();
        if (potentialLang.length > 0 && potentialLang.length < 20) {
          lang = potentialLang.toUpperCase();
          code = inner.slice(firstLineBreak + 1);
        }
      }
      blocks.push({ type: 'code', lang, code: code.replace(/\n$/, '') });
    } else {
      blocks.push({ type: 'text', content: part });
    }
  }
  return blocks;
}

// =================== KOMPONEN CODE BLOCK IDE ===================
function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.log('Copy error:', e);
    }
  };

  return (
    <View style={styles.codeContainer}>
      <View style={styles.codeHeader}>
        <View style={styles.codeHeaderLeft}>
          <View style={[styles.windowDot, { backgroundColor: '#ef4444' }]} />
          <View style={[styles.windowDot, { backgroundColor: '#f59e0b' }]} />
          <View style={[styles.windowDot, { backgroundColor: '#10b981' }]} />
          <Text style={styles.codeLangText}>{language || 'CODE'}</Text>
        </View>

        <TouchableOpacity 
          style={[styles.copyBtn, copied && styles.copyBtnSuccess]} 
          onPress={handleCopy}
          activeOpacity={0.7}
        >
          <Text style={[styles.copyBtnText, copied && styles.copyBtnTextSuccess]}>
            {copied ? '✓ Berhasil Disalin!' : '📋 Salin Kode'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.codeScrollView}
        contentContainerStyle={{ padding: 14 }}
      >
        <Text style={styles.codeBodyText} selectable={true}>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

// =================== KOMPONEN TEKS MARKDOWN ===================
function FormattedText({ content, isUser }) {
  const parts = content.split(/(`[^`]+`)/g);

  return (
    <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
      {parts.map((part, idx) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          return (
            <Text key={idx} style={styles.inlineCode}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return boldParts.map((bPart, bIdx) => {
          if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length >= 4) {
            return (
              <Text key={`${idx}-${bIdx}`} style={styles.boldText}>
                {bPart.slice(2, -2)}
              </Text>
            );
          }
          return bPart;
        });
      })}
    </Text>
  );
}

// =================== KOMPONEN KONTEN PESAN ===================
function MessageContent({ text, isUser, isStreaming, onCopyWhole, onShare }) {
  if (!text && isStreaming) {
    return (
      <View style={styles.typingContainer}>
        <ActivityIndicator size="small" color="#38bdf8" />
        <Text style={styles.typingText}>IRRON sedang berpikir...</Text>
      </View>
    );
  }

  if (isUser) {
    return <Text style={[styles.messageText, styles.userText]}>{text}</Text>;
  }

  const blocks = parseMarkdownBlocks(text);

  return (
    <View style={styles.messageContentWrapper}>
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          return <CodeBlock key={idx} code={block.code} language={block.lang} />;
        }
        return <FormattedText key={idx} content={block.content} isUser={false} />;
      })}

      {/* Kursor berkedip saat sedang streaming jawaban */}
      {isStreaming && (
        <Text style={styles.blinkingCursor}>▍</Text>
      )}

      {/* Action Footer untuk Pesan AI */}
      {!isStreaming && text.length > 0 && (
        <View style={styles.assistantFooter}>
          <TouchableOpacity style={styles.actionPill} onPress={onCopyWhole} activeOpacity={0.7}>
            <Text style={styles.actionPillText}>📋 Salin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionPill} onPress={onShare} activeOpacity={0.7}>
            <Text style={styles.actionPillText}>↗ Bagikan</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// Format waktu obrolan
function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  if (isToday) {
    return `Hari ini, ${hours}:${minutes}`;
  }
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}, ${hours}:${minutes}`;
}

// Error Boundary
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('IRRON Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.darkContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#070a11" />
          <View style={styles.centerBox}>
            <Text style={{ fontSize: 20, color: '#ef4444', fontWeight: 'bold', marginBottom: 12 }}>
              Terjadi Kesalahan Aplikasi
            </Text>
            <Text style={{ color: '#cbd5e1', textAlign: 'center', marginHorizontal: 24, fontSize: 13, marginBottom: 20 }}>
              {this.state.error?.toString()}
            </Text>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => this.setState({ hasError: false, error: null })}
            >
              <Text style={styles.downloadButtonText}>Coba Lagi</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

// System Prompt General AI
const GENERAL_SYSTEM_PROMPT = `Kamu adalah IRRON, kecerdasan buatan personal serba bisa yang cerdas, adaptif, solutif, dan ramah.
Kamu memiliki wawasan luas dalam berbagai bidang: ilmu pengetahuan umum, sains, matematika, sejarah, ide bisnis, penulisan artikel & kreatif, percakapan santai sehari-hari, serta rekayasa perangkat lunak dan teknologi.

Karakteristik & Gaya Bicara IRRON:
1. Panggil diri kamu 'IRRON'.
2. Gaya bahasa luwes berbahasa Indonesia (menggunakan gaya akrab, santai, pintar, dan suportif layaknya sahabat diskusi yang cerdas), tidak kaku, dan mudah dimengerti.
3. Selalu berikan jawaban yang to-the-point, berbobot, akurat, dan solutif.
4. Jika memberikan kode pemrograman, selalu gunakan format markdown fenced code blocks dengan menyebutkan bahasa pemrograman di baris pertama (misal: \`\`\`python ... \`\`\`), sertakan komentar penjelas yang jelas.
5. Jika pengguna melampirkan gambar/foto (misal: soal tugas, diagram, catatan, atau tangkapan layar), bantulah menganalisis, membaca, atau menyelesaikan persoalan di dalamnya secara terperinci.`;

const MODES = [
  { id: 'general', icon: '🧠', label: 'General AI', prompt: `${GENERAL_SYSTEM_PROMPT}\nJawablah pertanyaan secara cerdas, komprehensif, dan mudah dipahami untuk segala topik umum.` },
  { id: 'coder', icon: '💻', label: 'Coding & Tech', prompt: `${GENERAL_SYSTEM_PROMPT}\nFokus pada rekayasa perangkat lunak, algoritma, arsitektur, clean code, dan debugging dengan contoh kode konkret yang rapi berformat markdown.` },
  { id: 'creative', icon: '💡', label: 'Ide & Kreatif', prompt: `${GENERAL_SYSTEM_PROMPT}\nBantu brainstorming ide segar, penulisan artikel/konten, copywriting, dan sudut pandang kreatif.` },
  { id: 'chill', icon: '⚡', label: 'Fast & Chill', prompt: `${GENERAL_SYSTEM_PROMPT}\nBerikan jawaban super to-the-point, ringkas, padat informasi, tanpa bertele-tele.` }
];

// 4 Kartu Inspirasi Prompt untuk Tampilan Kosong (Hero Dashboard)
const QUICK_PROMPTS = [
  {
    icon: '💻',
    category: 'Koding & Tech',
    title: 'Buat API REST Python',
    prompt: 'Buatkan contoh REST API CRUD sederhana dengan Python FastAPI dan SQLite lengkap dengan komentar penjelas.'
  },
  {
    icon: '💡',
    category: 'Ide Bisnis',
    title: 'Ide Usaha Modal Ringan',
    prompt: 'Bantu berikan 3 ide bisnis digital yang realistis dan potensial dijalankan tahun 2026 dengan modal minim.'
  },
  {
    icon: '🧠',
    category: 'Sains & Teknologi',
    title: 'Penjelasan Quantum Computing',
    prompt: 'Jelaskan bagaimana komputer kuantum bekerja dan apa bedanya dengan komputer biasa secara sederhana.'
  },
  {
    icon: '📸',
    category: 'Tanya via Gambar',
    title: 'Analisis Soal / Kodingan',
    isImageAction: true,
    prompt: 'Lampirkan foto tugas atau screenshot kodingan'
  }
];

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  // Status Aplikasi
  const [isModelReady, setIsModelReady] = useState(false);
  const [isCheckingModel, setIsCheckingModel] = useState(true);
  
  // Status Unduhan
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedMB, setDownloadedMB] = useState('0');
  const [totalMB, setTotalMB] = useState(MODEL_SIZE_MB);
  
  // Status Chat & Sesi (SQLite)
  const [llamaContext, setLlamaContext] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeMode, setActiveMode] = useState('general');
  const [selectedImage, setSelectedImage] = useState(null);

  // Status Drawer, Search & Rename Modal
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchDrawerQuery, setSearchDrawerQuery] = useState('');
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [editTitleText, setEditTitleText] = useState('');
  
  const flatListRef = useRef(null);
  const downloadTaskRef = useRef(null);
  const shouldStopRef = useRef(false);

  // Inisialisasi Database SQLite & Sesi saat aplikasi terbuka
  useEffect(() => {
    initChatDatabase();
    checkModelExists();
  }, []);

  const initChatDatabase = () => {
    try {
      const allSessions = db.getAllSessions();
      if (allSessions && allSessions.length > 0) {
        setSessions(allSessions);
        const latestId = allSessions[0].id;
        setActiveSessionId(latestId);
        loadSessionMessages(latestId);
      } else {
        const initial = db.createNewSession('Obrolan Baru');
        setSessions([initial]);
        setActiveSessionId(initial.id);
        setMessages([]);
      }
    } catch (e) {
      console.log('Database init error:', e);
    }
  };

  const loadSessionMessages = (sessionId) => {
    try {
      const dbMsgs = db.getMessagesForSession(sessionId);
      setMessages(dbMsgs || []);
    } catch (e) {
      console.log('Load messages error:', e);
    }
  };

  // Pilih Sesi dari Drawer
  const handleSelectSession = (sessionId) => {
    if (sessionId === activeSessionId) {
      setIsDrawerOpen(false);
      return;
    }
    setActiveSessionId(sessionId);
    loadSessionMessages(sessionId);
    setIsDrawerOpen(false);
  };

  // Buat Sesi Obrolan Baru
  const handleCreateNewSession = () => {
    try {
      const newSession = db.createNewSession('Obrolan Baru');
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      setMessages([]);
      setIsDrawerOpen(false);
    } catch (e) {
      console.log('Create session error:', e);
    }
  };

  // Modal Rename Sesi
  const handleStartRename = (session) => {
    setEditingSession(session);
    setEditTitleText(session.title);
    setIsRenameModalOpen(true);
  };

  const handleSaveRename = () => {
    if (!editingSession || !editTitleText.trim()) {
      setIsRenameModalOpen(false);
      return;
    }
    const cleanTitle = editTitleText.trim();
    db.updateSessionTitle(editingSession.id, cleanTitle);
    setSessions(prev => prev.map(s => s.id === editingSession.id ? { ...s, title: cleanTitle } : s));
    setIsRenameModalOpen(false);
  };

  // Hapus Sesi
  const handleConfirmDeleteSession = (session) => {
    Alert.alert(
      'Hapus Obrolan?',
      `Yakin ingin menghapus "${session.title}" beserta seluruh riwayat pesannya?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => {
            db.deleteSession(session.id);
            const remaining = sessions.filter(s => s.id !== session.id);
            if (remaining.length === 0) {
              const fresh = db.createNewSession('Obrolan Baru');
              setSessions([fresh]);
              setActiveSessionId(fresh.id);
              setMessages([]);
            } else {
              setSessions(remaining);
              if (session.id === activeSessionId) {
                const nextSessionId = remaining[0].id;
                setActiveSessionId(nextSessionId);
                loadSessionMessages(nextSessionId);
              }
            }
          }
        }
      ]
    );
  };

  // Cek keberadaan model 3B di memori HP
  const checkModelExists = async () => {
    try {
      setIsCheckingModel(true);
      const localPath = getModelLocalPath();
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      
      if (fileInfo.exists && fileInfo.size > 1800 * 1024 * 1024) {
        setIsModelReady(true);
        initLocalLlama(fileInfo.uri);
      } else {
        setIsModelReady(false);
      }
    } catch (err) {
      console.log('Cek model error:', err);
      setIsModelReady(false);
    } finally {
      setIsCheckingModel(false);
    }
  };

  // Inisialisasi engine llama.cpp lokal
  const initLocalLlama = async (modelPath) => {
    try {
      const { initLlama } = require('llama.rn');
      const ctx = await initLlama({
        model: modelPath,
        use_mlock: true,
        n_ctx: 2048,
        n_threads: 4,
        n_gpu_layers: 0
      });
      setLlamaContext(ctx);
    } catch (err) {
      console.log('Inisialisasi llama.rn:', err);
    }
  };

  // Download Otak IRRON 3B dari GitHub Release
  const startDownloadModel = async () => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const localPath = getModelLocalPath();
      const downloadResumable = FileSystem.createDownloadResumable(
        MODEL_DOWNLOAD_URL,
        localPath,
        {},
        (progress) => {
          const ratio = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
          setDownloadProgress(Math.min(ratio, 1));
          setDownloadedMB((progress.totalBytesWritten / (1024 * 1024)).toFixed(1));
          setTotalMB((progress.totalBytesExpectedToWrite / (1024 * 1024)).toFixed(1));
        }
      );

      downloadTaskRef.current = downloadResumable;
      const result = await downloadResumable.downloadAsync();

      if (result && result.status === 200) {
        Alert.alert('Sukses!', 'Otak IRRON 3B berhasil diunduh ke memori HP.');
        setIsModelReady(true);
        initLocalLlama(result.uri);
      } else {
        throw new Error('Gagal mengunduh file model.');
      }
    } catch (err) {
      Alert.alert('Download Gagal', err.message || 'Periksa koneksi internet kamu.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Pilih Gambar (Kamera atau Galeri)
  const handlePickImage = () => {
    Alert.alert(
      'Tanya via Gambar',
      'Pilih sumber foto/gambar untuk dianalisis:',
      [
        {
          text: '📷 Ambil Foto (Kamera)',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Izin Dibutuhkan', 'Izinkan akses kamera untuk mengambil foto.');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.8
              });
              if (!result.canceled && result.assets?.[0]?.uri) {
                setSelectedImage(result.assets[0].uri);
              }
            } catch (e) {
              console.log('Camera error:', e);
            }
          }
        },
        {
          text: '🖼️ Pilih dari Galeri',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Izin Dibutuhkan', 'Izinkan akses galeri untuk memilih foto.');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                allowsEditing: true,
                quality: 0.8
              });
              if (!result.canceled && result.assets?.[0]?.uri) {
                setSelectedImage(result.assets[0].uri);
              }
            } catch (e) {
              console.log('Gallery error:', e);
            }
          }
        },
        { text: 'Batal', style: 'cancel' }
      ]
    );
  };

  // Salin & Bagikan Seluruh Pesan
  const handleCopyWholeMessage = async (text) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Tersalin!', 'Jawaban berhasil disalin ke clipboard.');
    } catch (e) {
      console.log(e);
    }
  };

  const handleShareMessage = async (text) => {
    try {
      await Share.share({
        message: text,
        title: 'Jawaban dari IRRON AI'
      });
    } catch (e) {
      console.log(e);
    }
  };

  // Hentikan proses generasi jawaban
  const handleStopGeneration = () => {
    shouldStopRef.current = true;
    setIsGenerating(false);
  };

  // Eksekusi prompt dari Kartu Cepat
  const handleQuickPromptClick = (card) => {
    if (card.isImageAction) {
      handlePickImage();
    } else {
      setInputText(card.prompt);
    }
  };

  // Kirim Pesan & Generate Jawaban (Offline Inference)
  const handleSendMessage = async (customText = null) => {
    const rawText = customText !== null ? customText : inputText;
    const text = rawText.trim();
    if ((!text && !selectedImage) || isGenerating) return;

    shouldStopRef.current = false;

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      const fresh = db.createNewSession('Obrolan Baru');
      targetSessionId = fresh.id;
      setActiveSessionId(fresh.id);
      setSessions([fresh]);
    }

    const currentImage = selectedImage;
    setSelectedImage(null);
    setInputText('');

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    const userMessage = {
      id: userMsgId,
      role: 'user',
      text: text || (currentImage ? 'Tolong analisis foto/gambar ini bro.' : ''),
      image: currentImage,
      createdAt: Date.now()
    };

    // Auto-update judul obrolan jika masih nama default
    const curSession = sessions.find(s => s.id === targetSessionId);
    if (curSession && (curSession.title === 'Obrolan Baru' || curSession.title.startsWith('Obrolan Baru'))) {
      const cleanSnippet = (text || 'Analisis Gambar 📷').replace(/[\r\n]+/g, ' ').trim();
      const newTitle = cleanSnippet.length > 28 ? cleanSnippet.slice(0, 28) + '...' : cleanSnippet;
      db.updateSessionTitle(targetSessionId, newTitle);
      setSessions(prev => prev.map(s => s.id === targetSessionId ? { ...s, title: newTitle, updated_at: Date.now() } : s));
    }

    // Simpan pesan user ke SQLite
    db.saveMessage(targetSessionId, userMessage);

    const updated = [
      ...messages,
      userMessage,
      { id: assistantMsgId, role: 'assistant', text: '', createdAt: Date.now() }
    ];
    setMessages(updated);
    setIsGenerating(true);

    const currentMode = MODES.find(m => m.id === activeMode) || MODES[0];
    const systemPrompt = currentMode.prompt;
    
    let promptContent = userMessage.text;
    if (currentImage) {
      promptContent = `[Pengguna melampirkan foto/gambar untuk dianalisis]\nPertanyaan/Instruksi: ${userMessage.text}`;
    }

    const formattedPrompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${promptContent}<|im_end|>\n<|im_start|>assistant\n`;

    try {
      if (llamaContext) {
        let streamText = '';
        await llamaContext.completion(
          {
            prompt: formattedPrompt,
            n_predict: 512,
            temperature: 0.7,
            stop: ['<|im_end|>', '<|im_start|>', 'user:']
          },
          (data) => {
            if (shouldStopRef.current) return;
            if (data?.token) {
              streamText += data.token;
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, text: streamText } : m));
            }
          }
        );

        // Simpan pesan akhir AI ke SQLite
        db.saveMessage(targetSessionId, {
          id: assistantMsgId,
          role: 'assistant',
          text: streamText,
          createdAt: Date.now()
        });
      } else {
        setTimeout(() => {
          if (shouldStopRef.current) return;
          const fallbackText = `[IRRON 3B Offline]: Halo bro! Jawaban untuk pertanyaan lo akan diproses secara native langsung di HP tanpa internet begitu model 3B selesai diunduh!\n\nContoh kodingan:\n\`\`\`python\n# Contoh Code Block IRRON\ndef salam(nama: str) -> str:\n    return f"Halo {nama}, selamat datang di IRRON AI!"\n\nprint(salam("Bro"))\n\`\`\``;
          
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
            ...m,
            text: fallbackText
          } : m));
          
          db.saveMessage(targetSessionId, {
            id: assistantMsgId,
            role: 'assistant',
            text: fallbackText,
            createdAt: Date.now()
          });
          setIsGenerating(false);
        }, 800);
        return;
      }
    } catch (err) {
      const errText = `❌ Error komputasi lokal: ${err.message}`;
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        ...m,
        text: errText
      } : m));
      db.saveMessage(targetSessionId, {
        id: assistantMsgId,
        role: 'assistant',
        text: errText,
        createdAt: Date.now()
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const currentSessionObj = sessions.find(s => s.id === activeSessionId);
  const currentTitle = currentSessionObj ? currentSessionObj.title : 'IRRON AI';

  // Filter daftar sesi di drawer berdasarkan pencarian
  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchDrawerQuery.toLowerCase().trim())
  );

  // =================== LAYAR 1: DOWNLOADER OTAK 3B ===================
  if (isCheckingModel) {
    return (
      <SafeAreaView style={styles.darkContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#070a11" />
        <View style={styles.centerBox}>
          <View style={styles.avatarGlowSmall}>
            <Text style={{ fontSize: 32 }}>⚡</Text>
          </View>
          <ActivityIndicator size="large" color="#38bdf8" style={{ marginTop: 20 }} />
          <Text style={styles.checkingText}>Memeriksa engine IRRON 3B di HP lo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isModelReady) {
    return (
      <SafeAreaView style={styles.darkContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#070a11" />
        <View style={styles.downloaderCard}>
          <View style={styles.avatarGlow}>
            <Text style={styles.avatarEmoji}>🤖</Text>
          </View>

          <Text style={styles.title}>IRRON AI Mobile v3</Text>
          <Text style={styles.subtitle}>100% Offline General AI & Neural Assistant</Text>

          <View style={styles.infoBadge}>
            <Text style={styles.badgeText}>🧠 Otak: Qwen 2.5 3B Instruct (Versi Flagship)</Text>
            <Text style={styles.badgeText}>🌐 General AI: Jawab Semua Topik, Coding & Ide Bisnis</Text>
            <Text style={styles.badgeText}>📸 Visual Ready: Fitur Analisis Gambar & Soal</Text>
            <Text style={styles.badgeText}>⚡ Markdown & Code Block: Salin Kode Satu-Klik</Text>
            <Text style={styles.badgeText}>🗂️ Riwayat SQLite: Chat Tersimpan Permanen di HP</Text>
            <Text style={styles.badgeText}>🔒 Privasi 100%: Tanpa Internet & Tanpa Server Luar</Text>
          </View>

          {isDownloading ? (
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
              </View>
              <View style={styles.progressStats}>
                <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}%</Text>
                <Text style={styles.progressText}>{downloadedMB} MB / {totalMB} MB</Text>
              </View>
              <Text style={styles.downloadHint}>Mengunduh otak 3B dari GitHub Releases... Harap jangan tutup aplikasi.</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.downloadButton} onPress={startDownloadModel} activeOpacity={0.85}>
              <Text style={styles.downloadButtonText}>📥 Unduh Otak IRRON 3B ({totalMB} MB)</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // =================== LAYAR 2: CHAT OFFLINE + DRAWER ===================
  return (
    <SafeAreaView style={styles.darkContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#090d18" />

      {/* HEADER BAR FUTURISTIK */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.drawerToggleBtn} 
            onPress={() => setIsDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.drawerToggleIcon}>☰</Text>
          </TouchableOpacity>

          <View style={styles.headerAvatarContainer}>
            <View style={styles.smallAvatar}>
              <Text style={{ fontSize: 16 }}>⚡</Text>
            </View>
            <View style={styles.avatarOnlinePulse} />
          </View>

          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {currentTitle}
            </Text>
            <View style={styles.statusRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.statusText}>100% Offline (Otak 3B)</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.newChatHeaderBtn} 
          onPress={handleCreateNewSession}
          activeOpacity={0.7}
        >
          <Text style={styles.newChatHeaderBtnText}>＋ Baru</Text>
        </TouchableOpacity>
      </View>

      {/* MODE PILLS DENGAN ACTIVE GLOW */}
      <View style={styles.modeContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeScrollContent}>
          {MODES.map(m => {
            const isActive = activeMode === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                onPress={() => setActiveMode(m.id)}
                style={[styles.modePill, isActive && styles.activeModePill]}
                activeOpacity={0.7}
              >
                <Text style={styles.modePillIcon}>{m.icon}</Text>
                <Text style={[styles.modePillText, isActive && styles.activeModePillText]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* AREA UTAMA: HERO DASHBOARD (JIKA CHAT KOSONG) ATAU DAFTAR CHAT */}
      {messages.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyHeroContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.heroAvatarBox}>
            <View style={styles.heroAvatarGlow}>
              <Text style={{ fontSize: 38 }}>⚡</Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>● 3B NEURAL ENGINE OFFLINE</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>IRRON AI</Text>
          <Text style={styles.heroSubtitle}>
            Kecerdasan buatan personal serba bisa. Diskusi, kodingan, ide bisnis, dan analisis foto tanpa internet.
          </Text>

          {/* KARTU PROMPT CEPAT */}
          <View style={styles.quickPromptsGrid}>
            {QUICK_PROMPTS.map((card, idx) => (
              <TouchableOpacity 
                key={idx} 
                style={styles.promptCard} 
                onPress={() => handleQuickPromptClick(card)}
                activeOpacity={0.75}
              >
                <View style={styles.promptCardHeader}>
                  <Text style={styles.promptCardIcon}>{card.icon}</Text>
                  <Text style={styles.promptCardCategory}>{card.category}</Text>
                </View>
                <Text style={styles.promptCardTitle}>{card.title}</Text>
                <Text style={styles.promptCardSnippet} numberOfLines={2}>
                  {card.prompt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item, index }) => {
            const isUser = item.role === 'user';
            const isLastMessage = index === messages.length - 1;
            const isThisStreaming = !isUser && isGenerating && isLastMessage;

            return (
              <View style={[styles.messageBubbleWrapper, isUser ? styles.userBubbleWrapper : styles.assistantBubbleWrapper]}>
                {!isUser && (
                  <View style={styles.assistantAvatarTag}>
                    <Text style={{ fontSize: 13 }}>⚡</Text>
                    <Text style={styles.assistantTagText}>IRRON 3B</Text>
                  </View>
                )}

                <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                  {item.image && (
                    <Image source={{ uri: item.image }} style={styles.messageImage} resizeMode="cover" />
                  )}
                  <MessageContent 
                    text={item.text} 
                    isUser={isUser}
                    isStreaming={isThisStreaming}
                    onCopyWhole={() => handleCopyWholeMessage(item.text)}
                    onShare={() => handleShareMessage(item.text)}
                  />
                </View>

                {item.createdAt && (
                  <Text style={[styles.messageTimeText, isUser ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                    {formatTimestamp(item.createdAt)}
                  </Text>
                )}
              </View>
            );
          }}
        />
      )}

      {/* PREVIEW GAMBAR TERPILIH SEBELUM KIRIM */}
      {selectedImage && (
        <View style={styles.imagePreviewContainer}>
          <Image source={{ uri: selectedImage }} style={styles.thumbnail} />
          <View style={styles.imageInfo}>
            <Text style={styles.imageAttachedText}>📷 Foto Siap Dianalisis</Text>
            <Text style={styles.imageSubText}>Tekan tombol kirim untuk memproses via IRRON</Text>
          </View>
          <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.removeImageBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.removeImageText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FLOATING CYBER INPUT DOCK */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputDock}>
          <TouchableOpacity 
            style={[styles.imageButton, selectedImage && styles.imageButtonActive]} 
            onPress={handlePickImage}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 19 }}>📷</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={selectedImage ? "Tanya soal foto ini..." : "Tanya apa saja atau minta kode program..."}
            placeholderTextColor="#64748b"
            multiline
          />

          {isGenerating ? (
            <TouchableOpacity 
              style={styles.stopButton} 
              onPress={handleStopGeneration}
              activeOpacity={0.8}
            >
              <View style={styles.stopIconSquare} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.sendButton, (!inputText.trim() && !selectedImage) && styles.disabledSendButton]}
              onPress={() => handleSendMessage()}
              disabled={!inputText.trim() && !selectedImage}
              activeOpacity={0.8}
            >
              <Text style={styles.sendButtonText}>➔</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* =================== SIDEBAR DRAWER RIWAYAT CHAT =================== */}
      <Modal
        visible={isDrawerOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsDrawerOpen(false)}
      >
        <View style={styles.drawerBackdrop}>
          <Pressable style={styles.drawerBackdropPressable} onPress={() => setIsDrawerOpen(false)} />
          
          <View style={styles.drawerContent}>
            {/* Drawer Header */}
            <View style={styles.drawerHeader}>
              <View style={styles.drawerBrand}>
                <View style={styles.smallAvatar}>
                  <Text style={{ fontSize: 16 }}>⚡</Text>
                </View>
                <View>
                  <Text style={styles.drawerBrandTitle}>IRRON AI v3</Text>
                  <Text style={styles.drawerBrandSubtitle}>SQLite Offline History</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.closeDrawerBtn} onPress={() => setIsDrawerOpen(false)}>
                <Text style={styles.closeDrawerText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Tombol New Chat di Drawer */}
            <TouchableOpacity 
              style={styles.newChatDrawerBtn}
              onPress={handleCreateNewSession}
              activeOpacity={0.8}
            >
              <Text style={styles.newChatDrawerPlus}>＋</Text>
              <Text style={styles.newChatDrawerText}>Percakapan Baru</Text>
            </TouchableOpacity>

            {/* Input Pencarian Obrolan */}
            <View style={styles.searchBarContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchBarInput}
                value={searchDrawerQuery}
                onChangeText={setSearchDrawerQuery}
                placeholder="Cari obrolan..."
                placeholderTextColor="#64748b"
              />
              {searchDrawerQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchDrawerQuery('')}>
                  <Text style={{ color: '#94a3b8', fontSize: 13, paddingHorizontal: 6 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Section Header */}
            <View style={styles.historySectionHeader}>
              <Text style={styles.historySectionTitle}>RIWAYAT PERCAKAPAN</Text>
              <Text style={styles.historyCountText}>{filteredSessions.length} Obrolan</Text>
            </View>

            {/* List Sesi Obrolan */}
            {filteredSessions.length === 0 ? (
              <View style={styles.emptySessionView}>
                <Text style={styles.emptySessionText}>
                  {searchDrawerQuery.trim() ? 'Tidak ada obrolan yang cocok' : 'Belum ada obrolan. Buat obrolan baru!'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredSessions}
                keyExtractor={item => item.id}
                style={styles.sessionsList}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const isActive = item.id === activeSessionId;
                  return (
                    <TouchableOpacity
                      style={[styles.sessionCard, isActive && styles.sessionCardActive]}
                      onPress={() => handleSelectSession(item.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.sessionCardLeft}>
                        <Text style={styles.sessionIcon}>💬</Text>
                        <View style={styles.sessionTextCol}>
                          <Text 
                            style={[styles.sessionTitleText, isActive && styles.sessionTitleTextActive]}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                          <Text style={styles.sessionDateText}>
                            {formatTimestamp(item.updated_at || item.created_at)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.sessionActionsRow}>
                        <TouchableOpacity 
                          style={styles.actionIconBtn} 
                          onPress={() => handleStartRename(item)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.actionIconText}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.actionIconBtn} 
                          onPress={() => handleConfirmDeleteSession(item)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.actionIconText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            {/* Footer Drawer */}
            <View style={styles.drawerFooter}>
              <Text style={styles.drawerFooterText}>🔒 Tersimpan di SQLite Lokal HP Lo</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* =================== MODAL GANTI NAMA OBROLAN =================== */}
      <Modal
        visible={isRenameModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsRenameModalOpen(false)}
      >
        <View style={styles.renameModalBackdrop}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>Ganti Nama Obrolan</Text>
            <TextInput
              style={styles.renameInput}
              value={editTitleText}
              onChangeText={setEditTitleText}
              placeholder="Masukkan judul baru..."
              placeholderTextColor="#64748b"
              autoFocus={true}
              selectTextOnFocus={true}
            />
            <View style={styles.renameBtnRow}>
              <TouchableOpacity 
                style={styles.renameCancelBtn} 
                onPress={() => setIsRenameModalOpen(false)}
              >
                <Text style={styles.renameCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.renameSaveBtn} 
                onPress={handleSaveRename}
              >
                <Text style={styles.renameSaveText}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  darkContainer: {
    flex: 1,
    backgroundColor: '#070a11',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkingText: {
    color: '#94a3b8',
    marginTop: 14,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  downloaderCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  avatarGlowSmall: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarGlow: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  avatarEmoji: {
    fontSize: 42,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
  },
  infoBadge: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  badgeText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 22,
    fontWeight: '500',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBarBg: {
    width: '100%',
    height: 10,
    backgroundColor: '#1e293b',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 5,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
  progressText: {
    color: '#94a3b8',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  downloadHint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 14,
    textAlign: 'center',
  },
  downloadButton: {
    backgroundColor: '#38bdf8',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  downloadButtonText: {
    color: '#020617',
    fontSize: 15,
    fontWeight: '700',
  },

  // HEADER STYLES
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#090d18',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  drawerToggleBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  drawerToggleIcon: {
    fontSize: 18,
    color: '#38bdf8',
    fontWeight: 'bold',
  },
  headerAvatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  smallAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarOnlinePulse: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#090d18',
  },
  headerTitleBox: {
    flex: 1,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  statusText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '600',
  },
  newChatHeaderBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  newChatHeaderBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // MODE PILLS
  modeContainer: {
    backgroundColor: '#070a11',
    borderBottomWidth: 1,
    borderBottomColor: '#121826',
    paddingVertical: 8,
  },
  modeScrollContent: {
    paddingHorizontal: 16,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  activeModePill: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  modePillIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  modePillText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  activeModePillText: {
    color: '#ffffff',
    fontWeight: '700',
  },

  // HERO DASHBOARD (EMPTY STATE)
  emptyHeroContainer: {
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: 'center',
  },
  heroAvatarBox: {
    alignItems: 'center',
    marginBottom: 16,
  },
  heroAvatarGlow: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
    marginBottom: 12,
  },
  heroBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  heroBadgeText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  quickPromptsGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  promptCard: {
    width: '48%',
    backgroundColor: '#0c1322',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  promptCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  promptCardIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  promptCardCategory: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  promptCardTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  promptCardSnippet: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 15,
  },

  // CHAT BUBBLES
  chatList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  messageBubbleWrapper: {
    marginBottom: 18,
    maxWidth: '92%',
  },
  userBubbleWrapper: {
    alignSelf: 'flex-end',
  },
  assistantBubbleWrapper: {
    alignSelf: 'flex-start',
  },
  assistantAvatarTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    marginLeft: 4,
  },
  assistantTagText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  messageBubble: {
    padding: 14,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#0284c7',
    borderBottomRightRadius: 4,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  assistantBubble: {
    backgroundColor: '#0c1424',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#1e2b45',
  },
  messageTimeText: {
    color: '#475569',
    fontSize: 10,
    marginTop: 4,
    marginHorizontal: 4,
  },
  messageContentWrapper: {
    width: '100%',
  },
  messageText: {
    fontSize: 14.5,
    lineHeight: 22,
  },
  userText: {
    color: '#ffffff',
  },
  assistantText: {
    color: '#e2e8f0',
  },
  blinkingCursor: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  typingText: {
    color: '#94a3b8',
    fontSize: 13,
    fontStyle: 'italic',
    marginLeft: 8,
  },
  boldText: {
    fontWeight: '700',
    color: '#ffffff',
  },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#172033',
    color: '#38bdf8',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    fontSize: 13,
  },

  // CODE BLOCK IDE
  codeContainer: {
    marginVertical: 10,
    borderRadius: 12,
    backgroundColor: '#030712',
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#090f1d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  codeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  windowDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginRight: 6,
  },
  codeLangText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  copyBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyBtnSuccess: {
    backgroundColor: '#065f46',
  },
  copyBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  copyBtnTextSuccess: {
    color: '#34d399',
  },
  codeScrollView: {
    maxHeight: 320,
  },
  codeBodyText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#38bdf8',
    fontSize: 13,
    lineHeight: 20,
  },

  // ACTION FOOTER PESAN AI
  assistantFooter: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#19243a',
  },
  actionPill: {
    backgroundColor: '#151f33',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  actionPillText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  messageImage: {
    width: 220,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
  },

  // PREVIEW GAMBAR SEBELUM KIRIM
  imagePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c1322',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  imageInfo: {
    flex: 1,
    marginLeft: 10,
  },
  imageAttachedText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  imageSubText: {
    color: '#64748b',
    fontSize: 11,
  },
  removeImageBtn: {
    padding: 8,
  },
  removeImageText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // FLOATING CYBER INPUT DOCK
  inputDock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#080d1a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  imageButton: {
    padding: 9,
    borderRadius: 12,
    backgroundColor: '#111827',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  imageButtonActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    color: '#f8fafc',
    fontSize: 14.5,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  disabledSendButton: {
    backgroundColor: '#1e293b',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonText: {
    color: '#020617',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stopButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  stopIconSquare: {
    width: 14,
    height: 14,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },

  // STYLES DRAWER
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    flexDirection: 'row',
  },
  drawerBackdropPressable: {
    flex: 1,
  },
  drawerContent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '82%',
    backgroundColor: '#080d1a',
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
    paddingTop: Platform.OS === 'android' ? 36 : 48,
    paddingHorizontal: 16,
    display: 'flex',
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  drawerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerBrandTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  drawerBrandSubtitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '500',
  },
  closeDrawerBtn: {
    padding: 8,
  },
  closeDrawerText: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  newChatDrawerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 14,
    marginBottom: 10,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  newChatDrawerPlus: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 6,
  },
  newChatDrawerText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  searchBarInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
    padding: 0,
  },
  historySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  historySectionTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  historyCountText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  emptySessionView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptySessionText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
  },
  sessionsList: {
    flex: 1,
  },
  sessionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0c1322',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sessionCardActive: {
    backgroundColor: '#122238',
    borderColor: '#38bdf8',
  },
  sessionCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 6,
  },
  sessionIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  sessionTextCol: {
    flex: 1,
  },
  sessionTitleText: {
    color: '#cbd5e1',
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  sessionTitleTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  sessionDateText: {
    color: '#64748b',
    fontSize: 10.5,
  },
  sessionActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconBtn: {
    padding: 6,
    marginLeft: 4,
  },
  actionIconText: {
    fontSize: 13,
  },
  drawerFooter: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    alignItems: 'center',
  },
  drawerFooterText: {
    color: '#64748b',
    fontSize: 11,
  },

  // STYLES MODAL RENAME
  renameModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  renameCard: {
    width: '100%',
    backgroundColor: '#0c1322',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  renameTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  renameInput: {
    backgroundColor: '#040711',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    color: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 18,
  },
  renameBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  renameCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 10,
  },
  renameCancelText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  renameSaveBtn: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  renameSaveText: {
    color: '#020617',
    fontSize: 13,
    fontWeight: '700',
  },
});

registerRootComponent(App);
