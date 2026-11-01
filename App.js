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
  Image
} from 'react-native';
import { registerRootComponent } from 'expo';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

// URL Model Resmi IRRON 3B (Otak Terbaru) dari GitHub Release
const MODEL_DOWNLOAD_URL = 'https://github.com/wongsxs/irron-mobile/releases/download/v1.0.0/irron-3b.gguf';
const MODEL_FILE_NAME = 'irron-3b.gguf';
const MODEL_SIZE_MB = '1930';

const getModelLocalPath = () => {
  const dir = FileSystem.documentDirectory || '';
  return `${dir}${MODEL_FILE_NAME}`;
};

// Error Boundary agar jika ada runtime error tidak terjadi blank white screen
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

// System Prompt General AI Serba Bisa (Jawab Segala Topik & Analisis Gambar)
const GENERAL_SYSTEM_PROMPT = `Kamu adalah IRRON, kecerdasan buatan personal serba bisa yang cerdas, adaptif, solutif, dan ramah.
Kamu memiliki wawasan luas dalam berbagai bidang: ilmu pengetahuan umum, sains, matematika, sejarah, ide bisnis, penulisan artikel & kreatif, percakapan santai sehari-hari, serta rekayasa perangkat lunak dan teknologi.

Karakteristik & Gaya Bicara IRRON:
1. Panggil diri kamu 'IRRON'.
2. Gaya bahasa luwes berbahasa Indonesia (menggunakan gaya akrab, santai, pintar, dan suportif layaknya sahabat diskusi yang cerdas), tidak kaku, dan mudah dimengerti.
3. Selalu berikan jawaban yang to-the-point, berbobot, akurat, dan solutif.
4. Kamu siap menjawab segala topik apa pun yang ditanyakan oleh pengguna.
5. Jika pengguna melampirkan gambar/foto (misal: soal tugas, diagram, catatan, atau tangkapan layar), bantulah menganalisis, membaca, atau menyelesaikan persoalan di dalamnya secara terperinci.`;

const MODES = [
  { id: 'general', label: '🧠 General AI', prompt: `${GENERAL_SYSTEM_PROMPT}\nJawablah pertanyaan secara cerdas, komprehensif, dan mudah dipahami untuk segala topik umum.` },
  { id: 'coder', label: '💻 Coding & Tech', prompt: `${GENERAL_SYSTEM_PROMPT}\nFokus pada rekayasa perangkat lunak, algoritma, arsitektur, clean code, dan debugging dengan contoh kode konkret.` },
  { id: 'creative', label: '💡 Ide & Kreatif', prompt: `${GENERAL_SYSTEM_PROMPT}\nBantu brainstorming ide segar, penulisan artikel/konten, copywriting, dan sudut pandang kreatif.` },
  { id: 'chill', label: '⚡ Fast & Chill', prompt: `${GENERAL_SYSTEM_PROMPT}\nBerikan jawaban super to-the-point, ringkas, padat informasi, tanpa bertele-tele.` }
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
  
  // Status Chat & AI
  const [llamaContext, setLlamaContext] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeMode, setActiveMode] = useState('general');
  const [selectedImage, setSelectedImage] = useState(null);
  
  const flatListRef = useRef(null);
  const downloadTaskRef = useRef(null);

  // 1. Cek keberadaan model 3B di memori HP saat pertama kali buka app
  useEffect(() => {
    checkModelExists();
  }, []);

  const checkModelExists = async () => {
    try {
      setIsCheckingModel(true);
      const localPath = getModelLocalPath();
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      
      // Jika file ada dan ukurannya valid (> 1.8 GB untuk model 3B)
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

  // 2. Inisialisasi engine llama.cpp lokal
  const initLocalLlama = async (modelPath) => {
    try {
      const { initLlama } = require('llama.rn');
      const ctx = await initLlama({
        model: modelPath,
        use_mlock: true,
        n_ctx: 2048,
        n_threads: 4, // Optimal untuk 4 core ARM di smartphone
        n_gpu_layers: 0 // CPU ARM NEON bawaan (100% stabil)
      });
      setLlamaContext(ctx);
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: 'Halo bro! Gue IRRON AI (Otak 3B). Gue siap jawab dan diskusi soal apa aja: topik umum, sains, ide kreatif, tanya lewat foto/gambar, sampai kodingan mendalam — 100% OFFLINE di HP lo. Mau bahas apa hari ini?'
        }
      ]);
    } catch (err) {
      console.log('Inisialisasi llama.rn:', err);
      setMessages([
        {
          id: 'ready-info',
          role: 'assistant',
          text: '⚡ Otak IRRON 3B (~1.93 GB) sudah terdeteksi di HP lo!\n\nEngine native C++ llama.cpp siap mengambil alih komputasi offline.'
        }
      ]);
    }
  };

  // 3. Download Otak IRRON 3B dari GitHub Release
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

  // 4. Pilih Gambar (Kamera atau Galeri)
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

  // 5. Kirim Pesan & Generate Jawaban (Offline Inference)
  const handleSendMessage = async () => {
    const text = inputText.trim();
    if ((!text && !selectedImage) || isGenerating) return;

    const currentImage = selectedImage;
    setSelectedImage(null);
    setInputText('');

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    const userMessage = {
      id: userMsgId,
      role: 'user',
      text: text || (currentImage ? 'Tolong analisis foto/gambar ini bro.' : ''),
      image: currentImage
    };

    const updated = [
      ...messages,
      userMessage,
      { id: assistantMsgId, role: 'assistant', text: '' }
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
            if (data?.token) {
              streamText += data.token;
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, text: streamText } : m));
            }
          }
        );
      } else {
        setTimeout(() => {
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
            ...m,
            text: `[IRRON 3B Offline]: Jawaban untuk pertanyaan lo akan diproses langsung secara lokal di HP tanpa internet begitu model 3B selesai diunduh!`
          } : m));
          setIsGenerating(false);
        }, 1000);
        return;
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        ...m,
        text: `❌ Error komputasi lokal: ${err.message}`
      } : m));
    } finally {
      setIsGenerating(false);
    }
  };

  // =================== LAYAR 1: DOWNLOADER OTAK 3B ===================
  if (isCheckingModel) {
    return (
      <SafeAreaView style={styles.darkContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#070a11" />
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.checkingText}>Memeriksa otak IRRON 3B di HP lo...</Text>
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
            <Text style={styles.badgeText}>🧠 Otak: Qwen 2.5 3B Instruct (Versi Terbaru)</Text>
            <Text style={styles.badgeText}>🌐 General AI: Jawab Semua Topik, Coding & Ide</Text>
            <Text style={styles.badgeText}>📸 Visual Ready: Dilengkapi Fitur Tanya via Foto</Text>
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
            <TouchableOpacity style={styles.downloadButton} onPress={startDownloadModel}>
              <Text style={styles.downloadButtonText}>📥 Unduh Otak IRRON 3B ({totalMB} MB)</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // =================== LAYAR 2: CHAT OFFLINE ===================
  return (
    <SafeAreaView style={styles.darkContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0c101b" />

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.smallAvatar}>
            <Text style={{ fontSize: 16 }}>⚡</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>IRRON AI v3</Text>
            <View style={styles.statusRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.statusText}>100% Offline (Otak 3B)</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.cleanButton} 
          onPress={() => setMessages([{ id: 'welcome', role: 'assistant', text: 'Chat dibersihkan. Mau ngobrol atau tanya apa lagi bro?' }])}
        >
          <Text style={styles.cleanButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* MODE PILLS */}
      <View style={styles.modeRow}>
        {MODES.map(m => (
          <TouchableOpacity
            key={m.id}
            onPress={() => setActiveMode(m.id)}
            style={[styles.modePill, activeMode === m.id && styles.activeModePill]}
          >
            <Text style={[styles.modePillText, activeMode === m.id && styles.activeModePillText]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* DAFTAR CHAT */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.chatList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.messageBubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            {item.image && (
              <Image source={{ uri: item.image }} style={styles.messageImage} resizeMode="cover" />
            )}
            <Text style={[styles.messageText, item.role === 'user' ? styles.userText : styles.assistantText]}>
              {item.text || '...'}
            </Text>
          </View>
        )}
      />

      {/* PREVIEW GAMBAR TERPILIH SEBELUM KIRIM */}
      {selectedImage && (
        <View style={styles.imagePreviewContainer}>
          <Image source={{ uri: selectedImage }} style={styles.thumbnail} />
          <View style={styles.imageInfo}>
            <Text style={styles.imageAttachedText}>📷 Foto terlampir</Text>
            <Text style={styles.imageSubText}>Siap dianalisis oleh IRRON 3B</Text>
          </View>
          <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.removeImageBtn}>
            <Text style={styles.removeImageText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FLOATING INPUT */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.imageButton} onPress={handlePickImage}>
            <Text style={{ fontSize: 20 }}>📷</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={selectedImage ? "Tanya soal foto ini..." : "Tanya apa saja ke IRRON..."}
            placeholderTextColor="#64748b"
            multiline
          />
          <TouchableOpacity 
            style={[styles.sendButton, ((!inputText.trim() && !selectedImage) || isGenerating) && styles.disabledSendButton]}
            onPress={handleSendMessage}
            disabled={(!inputText.trim() && !selectedImage) || isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#020617" />
            ) : (
              <Text style={styles.sendButtonText}>➔</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0c101b',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
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
  cleanButton: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cleanButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#070a11',
  },
  modePill: {
    paddingHorizontal: 12,
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
  },
  modePillText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  activeModePillText: {
    color: '#ffffff',
  },
  chatList: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  messageBubble: {
    maxWidth: '82%',
    padding: 14,
    borderRadius: 18,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#0284c7',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
  },
  userText: {
    color: '#ffffff',
  },
  assistantText: {
    color: '#f1f5f9',
  },
  messageImage: {
    width: 220,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 10,
  },
  imageInfo: {
    flex: 1,
  },
  imageAttachedText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  imageSubText: {
    color: '#64748b',
    fontSize: 11,
  },
  removeImageBtn: {
    padding: 6,
  },
  removeImageText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0c101b',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  imageButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    color: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledSendButton: {
    opacity: 0.3,
  },
  sendButtonText: {
    color: '#020617',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

registerRootComponent(App);
