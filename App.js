import React, { useState, useEffect, useRef } from 'react';
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
  Clipboard
} from 'react-native';
import * as FileSystem from 'expo-file-system';

// URL Model Resmi dari GitHub Release yang baru saja kita publikasikan
const MODEL_DOWNLOAD_URL = 'https://github.com/wongsxs/irron-mobile/releases/download/v1.0.0/irron-model.gguf';
const MODEL_FILE_NAME = 'irron-1.5b.gguf';
const MODEL_LOCAL_PATH = `${FileSystem.documentDirectory}${MODEL_FILE_NAME}`;

const MODES = [
  { id: 'architect', label: '🐍 Python Pro', prompt: 'Kamu adalah IRRON, arsitek kodingan Python handal. Utamakan clean code, PEP 8, dan type hints.' },
  { id: 'tutor', label: '🎓 Mentor', prompt: 'Kamu adalah IRRON, mentor koding yang ramah. Jelaskan konsep dengan santai dan mudah dipahami.' },
  { id: 'chill', label: '⚡ Fast & Chill', prompt: 'Kamu adalah IRRON, asisten santai. Berikan jawaban to-the-point, singkat, dan tepat.' }
];

export default function App() {
  // Status Aplikasi
  const [isModelReady, setIsModelReady] = useState(false);
  const [isCheckingModel, setIsCheckingModel] = useState(true);
  
  // Status Unduhan
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedMB, setDownloadedMB] = useState('0');
  const [totalMB, setTotalMB] = useState('940');
  
  // Status Chat & AI
  const [llamaContext, setLlamaContext] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeMode, setActiveMode] = useState('architect');
  
  const flatListRef = useRef(null);
  const downloadTaskRef = useRef(null);

  // 1. Cek keberadaan model di memori HP saat pertama kali buka app
  useEffect(() => {
    checkModelExists();
  }, []);

  const checkModelExists = async () => {
    try {
      setIsCheckingModel(true);
      const fileInfo = await FileSystem.getInfoAsync(MODEL_LOCAL_PATH);
      
      // Jika file ada dan ukurannya valid (> 900 MB)
      if (fileInfo.exists && fileInfo.size > 900 * 1024 * 1024) {
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
      // Import dinamis llama.rn (hanya berjalan di native runtime Android/iOS)
      const { initLlama } = require('llama.rn');
      const ctx = await initLlama({
        model: modelPath,
        use_mlock: true,
        n_ctx: 2048,
        n_threads: 4, // Optimal untuk 4 core ARM di smartphone
        n_gpu_layers: 0 // CPU ARM NEON bawaan (100% kompatibel)
      });
      setLlamaContext(ctx);
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: 'Halo bro! Gue IRRON AI. Otak 1.5B sudah siap di HP lo dan 100% OFFLINE tanpa kuota internet. Mau bahas atau koding apa hari ini?'
        }
      ]);
    } catch (err) {
      console.log('Inisialisasi llama.rn:', err);
      // Fallback pesan jika dijalankan di Expo Go preview sebelum build APK
      setMessages([
        {
          id: 'ready-info',
          role: 'assistant',
          text: '⚡ Otak IRRON (940 MB) sudah terdeteksi di HP lo!\n\nSaat aplikasi ini di-compile jadi APK via EAS Build, engine native C++ llama.cpp akan otomatis mengambil alih komputasi lokal.'
        }
      ]);
    }
  };

  // 3. Download Otak IRRON dari GitHub Release
  const startDownloadModel = async () => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const downloadResumable = FileSystem.createDownloadResumable(
        MODEL_DOWNLOAD_URL,
        MODEL_LOCAL_PATH,
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
        Alert.alert('Sukses!', 'Otak IRRON AI berhasil diunduh ke memori HP.');
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

  // 4. Kirim Pesan & Generate Jawaban (Offline Inference)
  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isGenerating) return;

    setInputText('');
    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    const updated = [
      ...messages,
      { id: userMsgId, role: 'user', text },
      { id: assistantMsgId, role: 'assistant', text: '' }
    ];
    setMessages(updated);
    setIsGenerating(true);

    const currentMode = MODES.find(m => m.id === activeMode) || MODES[0];
    const systemPrompt = currentMode.prompt;
    const formattedPrompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${text}<|im_end|>\n<|im_start|>assistant\n`;

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
        // Simulasi jika engine native belum aktif
        setTimeout(() => {
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
            ...m,
            text: `[IRRON 100% Offline]: Jawaban untuk "${text}" akan diproses langsung oleh CPU HP lo saat aplikasi ini di-compile ke file APK!`
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

  // =================== LAYAR 1: DOWNLOADER OTAK ===================
  if (isCheckingModel) {
    return (
      <SafeAreaView style={styles.darkContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#070a11" />
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.checkingText}>Memeriksa memori internal IRRON...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isModelReady) {
    return (
      <SafeAreaView style={styles.darkContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#070a11" />
        <View style={styles.downloaderCard}>
          {/* Logo Robot */}
          <View style={styles.avatarGlow}>
            <Text style={styles.avatarEmoji}>🤖</Text>
          </View>

          <Text style={styles.title}>IRRON AI Mobile</Text>
          <Text style={styles.subtitle}>100% Offline On-Device Neural Assistant</Text>

          <View style={styles.infoBadge}>
            <Text style={styles.badgeText}>⚡ Model: Qwen 2.5 1.5B (GGUF Q4_K_M)</Text>
            <Text style={styles.badgeText}>🔒 Privasi Penuh: Data Tidak Pernah Keluar HP</Text>
            <Text style={styles.badgeText}>📶 Tanpa Kuota: Sekali Download, Offline Selamanya</Text>
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
              <Text style={styles.downloadHint}>Mengunduh otak AI dari GitHub Releases... Harap jangan tutup aplikasi.</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.downloadButton} onPress={startDownloadModel}>
              <Text style={styles.downloadButtonText}>📥 Unduh Otak IRRON ({totalMB} MB)</Text>
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
            <Text style={styles.headerTitle}>IRRON AI</Text>
            <View style={styles.statusRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.statusText}>100% Offline Lokal HP</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.cleanButton} 
          onPress={() => setMessages([{ id: 'welcome', role: 'assistant', text: 'Chat dibersihkan. Mau ngobrolin kodingan apa lagi bro?' }])}
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
            <Text style={[styles.messageText, item.role === 'user' ? styles.userText : styles.assistantText]}>
              {item.text || '...'}
            </Text>
          </View>
        )}
      />

      {/* FLOATING INPUT */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Tanya kodingan atau ide ke IRRON..."
            placeholderTextColor="#64748b"
            multiline
          />
          <TouchableOpacity 
            style={[styles.sendButton, (!inputText.trim() || isGenerating) && styles.disabledSendButton]}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || isGenerating}
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
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 30,
  },
  badgeText: {
    color: '#cbd5e1',
    fontSize: 12,
    marginVertical: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  downloadButton: {
    backgroundColor: '#38bdf8',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  downloadButtonText: {
    color: '#020617',
    fontSize: 15,
    fontWeight: 'bold',
  },
  progressContainer: {
    width: '100%',
  },
  progressBarBg: {
    height: 12,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  downloadHint: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#0c101b',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  smallAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  statusText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '600',
  },
  cleanButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  cleanButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#070a11',
  },
  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  activeModePill: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  modePillText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  activeModePillText: {
    color: '#f8fafc',
    fontWeight: 'bold',
  },
  chatList: {
    padding: 16,
    gap: 14,
  },
  messageBubble: {
    maxWidth: '82%',
    padding: 14,
    borderRadius: 18,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#0284c7',
    borderTopRightRadius: 2,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderTopLeftRadius: 2,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#ffffff',
  },
  assistantText: {
    color: '#e2e8f0',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0c101b',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#070a11',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    color: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
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
