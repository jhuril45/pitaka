import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { AppText } from '@/components/ui/text';
import { useAccounts } from '@/data/repos/accounts';
import { useCategories } from '@/data/repos/categories';
import { saveTransaction } from '@/data/repos/transactions';
import { prepareImage, queueAttachment, type PreparedImage } from '@/features/attachments/attachments';
import { TransactionForm, type TransactionFormResult } from '@/features/transactions/transaction-form';
import { categoryByKeywords } from '@/lib/parser/categories';
import { parseReceipt, type ReceiptGuess } from '@/lib/ocr/receipt';
import { OCR_AVAILABLE, recognizeText } from '@/lib/ocr/recognize';
import { useCurrentProfileUuid } from '@/stores/profile-store';
import { syncNow } from '@/sync/engine';
import { useTheme } from '@/theme';

type Step = { kind: 'pick' } | { kind: 'reading' } | { kind: 'review'; image: PreparedImage; text: string | null; guess: ReceiptGuess };

/** Scan a receipt: photo → on-device OCR → prefilled form → save with the photo attached. */
export default function ScanReceiptScreen() {
  const profileUuid = useCurrentProfileUuid();
  const { colors, radius, spacing } = useTheme();
  const { data: accounts } = useAccounts(profileUuid);
  const { data: categories } = useCategories(profileUuid);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [error, setError] = useState<string | null>(null);

  async function pick(source: 'camera' | 'library') {
    setError(null);
    const permission =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(source === 'camera' ? 'Allow camera access in Settings to scan receipts.' : 'Allow photo access in Settings to choose a receipt.');
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setStep({ kind: 'reading' });
    try {
      const image = await prepareImage(asset.uri);
      const text = OCR_AVAILABLE ? await recognizeText(image.uri) : null;
      setStep({ kind: 'review', image, text, guess: text ? parseReceipt(text) : { amountMinor: null, merchant: null, date: null } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.');
      setStep({ kind: 'pick' });
    }
  }

  if (!accounts || !categories) return null;

  async function onSubmit(values: TransactionFormResult) {
    if (step.kind !== 'review') return;
    const tx = await saveTransaction({ ...values, profileUuid, source: 'ocr', recurringRuleUuid: null, installmentUuid: null });
    await queueAttachment({ profileUuid, transactionUuid: tx.uuid, base64: step.image.base64, ocrText: step.text });
    void syncNow('receipt');
    router.back();
  }

  const guessedCategory =
    step.kind === 'review' && step.guess.merchant ? categoryByKeywords(step.guess.merchant, categories, 'expense')?.category.uuid ?? null : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />
        {step.kind === 'pick' ? (
          <Card>
            <AppText variant="heading">Scan a receipt</AppText>
            <AppText tone="muted">
              {OCR_AVAILABLE
                ? 'Pitaka reads the total, store and date on your phone — the photo never leaves it until it syncs.'
                : 'In the browser the photo is attached to the transaction; enter the amount yourself.'}
            </AppText>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {Platform.OS !== 'web' ? <Button title="Take photo" onPress={() => void pick('camera')} /> : null}
              <Button title="Choose photo" variant={Platform.OS === 'web' ? 'primary' : 'outline'} onPress={() => void pick('library')} />
            </View>
          </Card>
        ) : null}
        {step.kind === 'reading' ? (
          <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="muted">Reading the receipt…</AppText>
          </View>
        ) : null}
        {step.kind === 'review' ? (
          <>
            <Image
              source={{ uri: `data:image/jpeg;base64,${step.image.base64}` }}
              style={[styles.preview, { borderRadius: radius.md }]}
              resizeMode="cover"
              accessibilityLabel="Receipt photo"
            />
            <AppText variant="caption" tone="muted">
              {step.text === null
                ? OCR_AVAILABLE
                  ? 'Couldn’t read text from this photo — fill in the details.'
                  : 'Fill in the details; the photo will be attached.'
                : step.guess.amountMinor === null
                  ? 'Found text but no total — check the amount.'
                  : 'Check what was read, then save.'}
            </AppText>
            <TransactionForm
              accounts={accounts}
              categories={categories}
              prefill={{
                type: 'expense',
                amountMinor: step.guess.amountMinor ?? undefined,
                merchant: step.guess.merchant ?? '',
                occurredAt: (step.guess.date ?? new Date()).toISOString(),
                categoryUuid: guessedCategory,
              }}
              onSubmit={onSubmit}
            />
            <Button title="Use a different photo" variant="ghost" onPress={() => setStep({ kind: 'pick' })} />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  preview: { width: '100%', height: 220 },
});
