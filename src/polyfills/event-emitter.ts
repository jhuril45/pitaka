/**
 * Web stand-in for `react-native/Libraries/vendor/emitter/EventEmitter`, which
 * the Parse React Native build imports (for LiveQuery) and react-native-web
 * doesn't ship. Wired up for web only in metro.config.js.
 */
type Listener = (...args: unknown[]) => void;

export default class EventEmitter {
  private listeners = new Map<string, Set<Listener>>();

  addListener(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return { remove: () => this.removeListener(event, listener) };
  }

  on(event: string, listener: Listener) {
    return this.addListener(event, listener);
  }

  removeListener(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  removeAllListeners(event?: string): void {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
