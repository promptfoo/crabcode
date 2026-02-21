import { io, type Socket } from 'socket.io-client';
import { mergeElements } from './merge';

export interface CollabClientOptions {
  roomId: string;
  username: string;
  onRemoteSceneUpdate: (elements: any[]) => void;
  onCollaboratorsChange: (collaborators: Map<string, CollaboratorInfo>) => void;
}

export interface CollaboratorInfo {
  username: string;
  color: string;
  pointer: { x: number; y: number };
}

export class CollabClient {
  private socket: Socket | null = null;
  private roomId: string;
  private username: string;
  private onRemoteSceneUpdate: (elements: any[]) => void;
  private onCollaboratorsChange: (collaborators: Map<string, CollaboratorInfo>) => void;

  private localElements: Map<string, any> = new Map();
  private lastSentVersions: Map<string, number> = new Map();
  private collaborators: Map<string, CollaboratorInfo> = new Map();
  private cursorThrottleTimer: number | null = null;
  private pendingCursor: { x: number; y: number } | null = null;
  private isReceivingRemote = false;

  constructor(opts: CollabClientOptions) {
    this.roomId = opts.roomId;
    this.username = opts.username;
    this.onRemoteSceneUpdate = opts.onRemoteSceneUpdate;
    this.onCollaboratorsChange = opts.onCollaboratorsChange;
  }

  connect(): void {
    this.socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.socket!.emit('join', {
        roomId: this.roomId,
        username: this.username,
      });
    });

    this.socket.on('full-state', (data: any) => {
      if (data.elements) {
        this.isReceivingRemote = true;
        // Set local tracking from full state
        for (const el of data.elements) {
          this.localElements.set(el.id, el);
          this.lastSentVersions.set(el.id, el.version);
        }
        this.onRemoteSceneUpdate(data.elements);
        this.isReceivingRemote = false;
      }
      if (data.participants) {
        for (const p of data.participants) {
          if (p.username !== this.username) {
            this.collaborators.set(p.username, {
              username: p.username,
              color: p.color,
              pointer: { x: 0, y: 0 },
            });
          }
        }
        this.onCollaboratorsChange(this.collaborators);
      }
    });

    this.socket.on('scene-update', (data: any) => {
      if (!data.elements || data.from === this.username) return;

      this.isReceivingRemote = true;

      // Merge remote elements with local state
      const currentLocal = Array.from(this.localElements.values());
      const merged = mergeElements(currentLocal, data.elements);

      // Update local tracking
      for (const el of merged) {
        this.localElements.set(el.id, el);
      }

      this.onRemoteSceneUpdate(merged);
      this.isReceivingRemote = false;
    });

    this.socket.on('cursor-update', (data: any) => {
      if (data.username === this.username) return;

      this.collaborators.set(data.username, {
        username: data.username,
        color: data.color,
        pointer: data.pointer,
      });
      this.onCollaboratorsChange(this.collaborators);
    });

    this.socket.on('participant-joined', (data: any) => {
      this.collaborators.set(data.username, {
        username: data.username,
        color: data.color,
        pointer: { x: 0, y: 0 },
      });
      this.onCollaboratorsChange(this.collaborators);
    });

    this.socket.on('participant-left', (data: any) => {
      this.collaborators.delete(data.username);
      this.onCollaboratorsChange(this.collaborators);
    });

    this.socket.on('disconnect', () => {
      // Socket.IO will auto-reconnect
    });

    this.socket.on('reconnect', () => {
      this.socket!.emit('request-state');
    });
  }

  handleLocalChange(elements: any[]): void {
    if (this.isReceivingRemote) return;
    if (!this.socket?.connected) return;

    // Find elements that changed since last send
    const changed: any[] = [];

    for (const el of elements) {
      const lastVersion = this.lastSentVersions.get(el.id);
      if (lastVersion === undefined || el.version > lastVersion) {
        changed.push(el);
        this.lastSentVersions.set(el.id, el.version);
      }
      this.localElements.set(el.id, el);
    }

    // Handle deleted elements (elements in local that aren't in new array)
    const currentIds = new Set(elements.map((el) => el.id));
    for (const [id] of this.localElements) {
      if (!currentIds.has(id)) {
        this.localElements.delete(id);
        this.lastSentVersions.delete(id);
      }
    }

    if (changed.length > 0) {
      this.socket.emit('scene-update', { elements: changed });
    }
  }

  sendCursorUpdate(pointer: { x: number; y: number }): void {
    this.pendingCursor = pointer;

    if (this.cursorThrottleTimer !== null) return;

    // Throttle cursor updates to ~20fps (50ms)
    this.cursorThrottleTimer = window.setTimeout(() => {
      this.cursorThrottleTimer = null;
      if (this.pendingCursor && this.socket?.connected) {
        this.socket.emit('cursor-update', { pointer: this.pendingCursor });
        this.pendingCursor = null;
      }
    }, 50);
  }

  disconnect(): void {
    if (this.cursorThrottleTimer !== null) {
      clearTimeout(this.cursorThrottleTimer);
    }
    this.socket?.disconnect();
    this.socket = null;
  }
}
