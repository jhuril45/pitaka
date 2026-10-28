import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useState } from 'react';

export type VoiceState = 'idle' | 'listening' | 'unavailable' | 'denied' | 'error';

/**
 * Speech → text for smart entry. Prefers on-device recognition (works offline
 * where the phone supports it); falls back to the platform's online recogniser.
 * `onText` receives the live transcript, final or interim.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useSpeechRecognitionEvent('start', () => setState('listening'));
  useSpeechRecognitionEvent('end', () => setState((s) => (s === 'listening' ? 'idle' : s)));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (transcript) onText(transcript);
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') {
      setState('idle');
      if (event.error === 'no-speech') setMessage('Didn’t catch that — try again.');
      return;
    }
    setState('error');
    setMessage(
      event.error === 'network'
        ? 'Voice needs a connection on this phone. Type it instead.'
        : event.error === 'language-not-supported' || event.error === 'service-not-allowed'
          ? 'Voice input isn’t available on this device. Type it instead.'
          : `Voice input stopped (${event.error}).`,
    );
  });

  const start = useCallback(async () => {
    setMessage(null);
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setState('unavailable');
      setMessage('Voice input isn’t available on this device. Type it instead.');
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setState('denied');
      setMessage('Allow microphone access to use voice input.');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
    });
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { state, message, start, stop, listening: state === 'listening' };
}
