import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/text';
import { useLocalQuery } from '@/data/use-local-query';
import { syncNow } from '@/sync/engine';
import { useTheme } from '@/theme';

import { ATTACHMENT_CLASS, listAttachments, pendingAttachments, prepareImage, queueAttachment } from './attachments';

/** Receipt photos of one transaction: uploaded ones, ones waiting to upload, and "add photo". */
export function AttachmentStrip({ profileUuid, transactionUuid }: { profileUuid: string; transactionUuid: string }) {
  const { colors, radius, spacing } = useTheme();
  const [busy, setBusy] = useState(false);
  const { data } = useLocalQuery(
    async () => ({
      uploaded: await listAttachments(profileUuid, transactionUuid),
      waiting: await pendingAttachments(transactionUuid),
    }),
    [ATTACHMENT_CLASS],
    [profileUuid, transactionUuid],
  );

  async function addPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      const image = await prepareImage(asset.uri);
      await queueAttachment({ profileUuid, transactionUuid, base64: image.base64, ocrText: null });
      void syncNow('attachment');
    } finally {
      setBusy(false);
    }
  }

  const images = [
    ...(data?.uploaded ?? []).filter((a) => a.file).map((a) => ({ key: a.uuid, uri: a.file!.url, waiting: false })),
    ...(data?.waiting ?? []).map((a) => ({ key: a.uuid, uri: `data:image/jpeg;base64,${a.base64}`, waiting: true })),
  ];

  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
      <AppText variant="label">Receipts</AppText>
      {images.length ? (
        <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
          {images.map((img) => (
            <View key={img.key}>
              <Image source={{ uri: img.uri }} style={[styles.thumb, { borderRadius: radius.sm, backgroundColor: colors.surfaceMuted }]} />
              {img.waiting ? (
                <AppText variant="caption" tone="muted" style={styles.caption}>
                  Waiting to upload
                </AppText>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : (
        <AppText variant="caption" tone="muted">
          No receipt attached.
        </AppText>
      )}
      <Button title="Add receipt photo" variant="outline" loading={busy} onPress={() => void addPhoto()} />
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 96, height: 128 },
  caption: { width: 96, textAlign: 'center' },
});
