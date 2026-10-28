import * as Network from 'expo-network';
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { AttachmentRecord } from '@shared/index';

import { emitChange } from '@/data/events';
import { withLock } from '@/data/lock';
import { listLive } from '@/data/local-store';
import { profilePin } from '@/data/pins';
import { saveRecord } from '@/data/repo';
import Storage from '@/lib/kv';
import { Parse } from '@/parse/init';
import { registerBeforePush } from '@/sync/engine';

/**
 * Receipt photos. A photo is shrunk to a JPEG and queued on the device; on the
 * next sync it is uploaded as a Parse.File (Wi-Fi only unless the user allows
 * mobile data), then an Attachment row referencing the file syncs like any
 * other record. Until then the screen shows the queued copy.
 */

const QUEUE_KEY = 'pitaka.sync.attachments';
const CELLULAR_KEY = 'pitaka.pref.upload-on-cellular';
const MAX_WIDTH = 1600;
export const ATTACHMENT_CLASS = 'Attachment';

export interface PendingAttachment {
  uuid: string;
  profileUuid: string;
  transactionUuid: string;
  mime: 'image/jpeg';
  base64: string;
  ocrText: string | null;
  queuedAt: string;
}

export interface PreparedImage {
  base64: string;
  uri: string;
  mime: 'image/jpeg';
}

/** Shrink a photo to at most 1600 px wide and encode it as JPEG. */
export async function prepareImage(uri: string): Promise<PreparedImage> {
  const context = ImageManipulator.manipulate(uri);
  const first = await context.renderAsync();
  const image = first.width > MAX_WIDTH ? await ImageManipulator.manipulate(uri).resize({ width: MAX_WIDTH }).renderAsync() : first;
  const saved = await image.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  return { base64: saved.base64 ?? '', uri: saved.uri, mime: 'image/jpeg' };
}

type Queue = Record<string, PendingAttachment>;

async function readQueue(): Promise<Queue> {
  const raw = await Storage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as Queue) : {};
}

export function queueAttachment(input: Omit<PendingAttachment, 'uuid' | 'queuedAt' | 'mime'>): Promise<string> {
  const uuid = randomUUID();
  return withLock(async () => {
    const queue = await readQueue();
    queue[uuid] = { ...input, uuid, mime: 'image/jpeg', queuedAt: new Date().toISOString() };
    await Storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }).then(() => {
    emitChange(ATTACHMENT_CLASS);
    return uuid;
  });
}

export async function pendingAttachments(transactionUuid?: string): Promise<PendingAttachment[]> {
  const all = Object.values(await readQueue());
  return transactionUuid ? all.filter((a) => a.transactionUuid === transactionUuid) : all;
}

export async function listAttachments(profileUuid: string, transactionUuid: string): Promise<AttachmentRecord[]> {
  const rows = await listLive<AttachmentRecord>('Attachment', [profilePin(profileUuid)]);
  return rows.filter((a) => a.transactionUuid === transactionUuid);
}

export async function getUploadOnCellular(): Promise<boolean> {
  return (await Storage.getItem(CELLULAR_KEY)) === '1';
}

export async function setUploadOnCellular(allowed: boolean): Promise<void> {
  await Storage.setItem(CELLULAR_KEY, allowed ? '1' : '0');
}

async function uploadsAllowedNow(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false) return false;
    if (state.type === Network.NetworkStateType.CELLULAR) return getUploadOnCellular();
    return true;
  } catch {
    return true;
  }
}

/**
 * Upload queued photos (called by the sync engine before it pushes). Returns
 * how many were uploaded. Failures stay queued for the next sync.
 */
export async function uploadPendingAttachments(): Promise<number> {
  const queue = await pendingAttachments();
  if (!queue.length || !(await uploadsAllowedNow())) return 0;
  let uploaded = 0;
  for (const item of queue) {
    try {
      const file = new Parse.File(`receipt-${item.uuid}.jpg`, { base64: item.base64 }, item.mime);
      await file.save();
      await saveRecord('Attachment', {
        uuid: item.uuid,
        profileUuid: item.profileUuid,
        transactionUuid: item.transactionUuid,
        file: { name: file.name(), url: file.url()! },
        mime: item.mime,
        ocrText: item.ocrText,
      });
      await withLock(async () => {
        const current = await readQueue();
        delete current[item.uuid];
        await Storage.setItem(QUEUE_KEY, JSON.stringify(current));
      });
      uploaded += 1;
    } catch {
      // Keep it queued; the next sync tries again.
    }
  }
  if (uploaded) emitChange(ATTACHMENT_CLASS);
  return uploaded;
}

// Upload queued photos at the start of every sync.
registerBeforePush(uploadPendingAttachments);
