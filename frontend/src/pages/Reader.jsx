import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Settings,
  ArrowLeft,
  Moon,
  Sun,
  Bookmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/components/ThemeProvider';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COLOR_PRESETS = {
  montessori: {
    name: 'Montessori',
    vowel: '#3B82F6',
    consonant: '#EF4444',
  },
  bionic: {
    name: 'Bionic Reading',
    vowel: '#8B5CF6',
    consonant: '#000000',
  },
  highContrast: {
    name: 'High Contrast',
    vowel: '#10B981',
    consonant: '#1F2937',
  },
  ocean: {
    name: 'Ocean',
    vowel: '#06B6D4',
    consonant: '#0E7490',
  },
};

const FONT_OPTIONS = [
  { name: 'Modern Sans', value: 'inter' },
  { name: 'Classic Serif', value: 'merriweather' },
  { name: 'Code Mono', value: 'jetbrains' },
];

export default function Reader() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const [document, setDocument] = useState(null);
  const [words, setWords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(200);
  const [fontSize, setFontSize] = useState(80);
  const [fontFamily, setFontFamily] = useState('inter');
  const [colorPreset, setColorPreset] = useState('montessori');
  const [customVowelColor, setCustomVowelColor] = useState('#3B82F6');
  const [customConsonantColor, setCustomConsonantColor] = useState('#EF4444');
  const [useCustomColors, setUseCustomColors] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [bookmark, setBookmark] = useState(null);
  const [stats, setStats] = useState({
    wordsRead: 0,
    timeSpent: 0,
    startTime: null,
  });

  const intervalRef = useRef(null);
  const lastUpdateRef = useRef(Date.now());

  // Fetch document and words
  useEffect(() => {
    fetchDocument();
    fetchWords();
    checkExistingSession();
  }, [docId]);

  // Handle playback
  useEffect(() => {
    if (isPlaying) {
      const interval = 60000 / speed; // Convert WPM to milliseconds
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= words.length - 1) {
            setIsPlaying(false);
            completeSession();
            return prev;
          }
          return prev + 1;
        });

        // Update stats
        setStats((prev) => ({
          ...prev,
          wordsRead: prev.wordsRead + 1,
          timeSpent: prev.timeSpent + (Date.now() - lastUpdateRef.current) / 1000,
        }));
        lastUpdateRef.current = Date.now();
      }, interval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, speed, words.length]);

  // Auto-save session every 10 seconds
  useEffect(() => {
    const autoSave = setInterval(() => {
      if (sessionId && currentIndex > 0) {
        updateSession();
      }
    }, 10000);

    return () => clearInterval(autoSave);
  }, [sessionId, currentIndex, stats]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skipForward();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skipBackward();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setSpeed((prev) => Math.min(1000, prev + 50));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setSpeed((prev) => Math.max(50, prev - 50));
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlaying]);

  const fetchDocument = async () => {
    try {
      const response = await axios.get(`${API}/documents/${docId}`);
      setDocument(response.data);
    } catch (error) {
      console.error('Error fetching document:', error);
      toast.error('Document not found');
      navigate('/library');
    }
  };

  const fetchWords = async () => {
    try {
      const response = await axios.get(`${API}/documents/${docId}/words`);
      setWords(response.data.words);
    } catch (error) {
      console.error('Error fetching words:', error);
      toast.error('Failed to load document content');
    }
  };

  const checkExistingSession = async () => {
    try {
      const response = await axios.get(`${API}/sessions/document/${docId}`);
      if (response.data) {
        setSessionId(response.data.id);
        setCurrentIndex(response.data.current_word_index);
        setSpeed(response.data.speed_wpm);
        toast.success('Resumed from last session');
      } else {
        createNewSession();
      }
    } catch (error) {
      createNewSession();
    }
  };

  const createNewSession = async () => {
    try {
      const response = await axios.post(`${API}/sessions`, {
        document_id: docId,
        current_word_index: 0,
        total_words: words.length || 0,
        words_read: 0,
        time_spent: 0,
        speed_wpm: speed,
        completed: false,
      });
      setSessionId(response.data.id);
      setStats({ ...stats, startTime: Date.now() });
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const updateSession = async () => {
    if (!sessionId) return;

    try {
      await axios.put(`${API}/sessions/${sessionId}`, {
        current_word_index: currentIndex,
        words_read: stats.wordsRead,
        time_spent: Math.floor(stats.timeSpent),
        speed_wpm: speed,
        completed: false,
      });
    } catch (error) {
      console.error('Error updating session:', error);
    }
  };

  const completeSession = async () => {
    if (!sessionId) return;

    try {
      await axios.put(`${API}/sessions/${sessionId}`, {
        current_word_index: currentIndex,
        words_read: stats.wordsRead,
        time_spent: Math.floor(stats.timeSpent),
        speed_wpm: speed,
        completed: true,
      });
      toast.success('Reading session completed! 🎉');
    } catch (error) {
      console.error('Error completing session:', error);
    }
  };

  const togglePlayPause = () => {
    if (!isPlaying && stats.startTime === null) {
      setStats({ ...stats, startTime: Date.now() });
    }
    setIsPlaying(!isPlaying);
  };

  const skipForward = () => {
    setCurrentIndex((prev) => Math.min(words.length - 1, prev + 1));
  };

  const skipBackward = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const saveBookmark = () => {
    setBookmark(currentIndex);
    toast.success('Bookmark saved');
  };

  const goToBookmark = () => {
    if (bookmark !== null) {
      setCurrentIndex(bookmark);
      toast.success('Jumped to bookmark');
    }
  };

  const renderWord = () => {
    if (!words[currentIndex]) return null;

    const wordData = words[currentIndex];
    const colors = useCustomColors
      ? { vowel: customVowelColor, consonant: customConsonantColor }
      : COLOR_PRESETS[colorPreset];

    return (
      <div className="flex flex-wrap justify-center items-center gap-1">
        {wordData.syllables.map((syllable, sylIndex) => (
          <span key={sylIndex} className="inline-flex">
            {syllable.split('').map((char, charIndex) => {
              const isVowelChar = wordData.vowels[sylIndex]?.includes(charIndex);
              const color = isVowelChar ? colors.vowel : colors.consonant;
              return (
                <span
                  key={charIndex}
                  style={{
                    color: theme === 'dark' && color === '#000000' ? '#ffffff' : color,
                  }}
                >
                  {char}
                </span>
              );
            })}
          </span>
        ))}
      </div>
    );
  };

  const progress = words.length > 0 ? (currentIndex / words.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            data-testid="back-to-library-button"
            variant="ghost"
            size="icon"
            onClick={() => {
              updateSession();
              navigate('/library');
            }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-semibold">{document?.title}</h1>
            <p className="text-sm text-muted-foreground">
              {currentIndex + 1} / {words.length} words
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            data-testid="theme-toggle-reader-button"
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button data-testid="settings-button" variant="outline" size="icon">
                <Settings className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Reader Settings</SheetTitle>
                <SheetDescription>Customize your reading experience</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* Font Family */}
                <div className="space-y-2">
                  <Label>Font Family</Label>
                  <Select value={fontFamily} onValueChange={setFontFamily}>
                    <SelectTrigger data-testid="font-family-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          {font.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Font Size */}
                <div className="space-y-2">
                  <Label>Font Size: {fontSize}px</Label>
                  <Slider
                    data-testid="font-size-slider"
                    value={[fontSize]}
                    onValueChange={([value]) => setFontSize(value)}
                    min={40}
                    max={150}
                    step={10}
                  />
                </div>

                {/* Color Preset */}
                <div className="space-y-2">
                  <Label>Color Pattern</Label>
                  <Select
                    value={useCustomColors ? 'custom' : colorPreset}
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        setUseCustomColors(true);
                      } else {
                        setUseCustomColors(false);
                        setColorPreset(value);
                      }
                    }}
                  >
                    <SelectTrigger data-testid="color-pattern-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {preset.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom Colors</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom Colors */}
                {useCustomColors && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Vowel Color</Label>
                      <input
                        data-testid="vowel-color-picker"
                        type="color"
                        value={customVowelColor}
                        onChange={(e) => setCustomVowelColor(e.target.value)}
                        className="w-full h-10 rounded-md border border-input cursor-pointer"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Consonant Color</Label>
                      <input
                        data-testid="consonant-color-picker"
                        type="color"
                        value={customConsonantColor}
                        onChange={(e) => setCustomConsonantColor(e.target.value)}
                        className="w-full h-10 rounded-md border border-input cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* Statistics */}
                <div className="pt-6 border-t space-y-2">
                  <h3 className="font-semibold mb-3">Session Stats</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Words Read:</span>
                      <span className="font-medium">{stats.wordsRead}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time:</span>
                      <span className="font-medium">
                        {Math.floor(stats.timeSpent / 60)}m {Math.floor(stats.timeSpent % 60)}s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Progress:</span>
                      <span className="font-medium">{progress.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Word Display Area */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.05 }}
            className={`word-display font-${fontFamily} font-bold tracking-wide`}
            style={{ fontSize: `${fontSize}px` }}
          >
            {renderWord()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Control Bar */}
      <div className="control-bar border-t border-border px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            {/* Playback Controls */}
            <div className="flex items-center gap-2">
              <Button
                data-testid="skip-backward-button"
                variant="outline"
                size="icon"
                onClick={skipBackward}
                disabled={currentIndex === 0}
              >
                <SkipBack className="w-5 h-5" />
              </Button>

              <Button
                data-testid="play-pause-button"
                size="icon"
                className="w-14 h-14"
                onClick={togglePlayPause}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6" />
                )}
              </Button>

              <Button
                data-testid="skip-forward-button"
                variant="outline"
                size="icon"
                onClick={skipForward}
                disabled={currentIndex >= words.length - 1}
              >
                <SkipForward className="w-5 h-5" />
              </Button>
            </div>

            {/* Speed Display */}
            <div className="text-center">
              <div className="text-2xl font-bold">{speed}</div>
              <div className="text-xs text-muted-foreground">WPM</div>
            </div>

            {/* Bookmark */}
            <Button
              data-testid="bookmark-button"
              variant="outline"
              onClick={bookmark !== null ? goToBookmark : saveBookmark}
            >
              <Bookmark className="w-4 h-4 mr-2" />
              {bookmark !== null ? 'Go to Bookmark' : 'Save Bookmark'}
            </Button>
          </div>

          {/* Speed Slider */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Reading Speed</Label>
            <Slider
              data-testid="speed-slider"
              value={[speed]}
              onValueChange={([value]) => setSpeed(value)}
              min={50}
              max={1000}
              step={10}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>50 WPM</span>
              <span>1000 WPM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}