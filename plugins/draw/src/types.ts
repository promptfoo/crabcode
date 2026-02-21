export interface DrawSession {
  id: string;
  title: string;
  creator: string;
  createdAt: string;
  endedAt?: string;
  participants: string[];
  description: string;
}

export interface ExcalidrawElement {
  id: string;
  version: number;
  versionNonce: number;
  [key: string]: unknown;
}

export interface ClientInfo {
  socketId: string;
  username: string;
  color: string;
  cursor: { x: number; y: number };
}

export interface RoomState {
  sessionId: string;
  elements: ExcalidrawElement[];
  clients: Map<string, ClientInfo>;
}

// Socket.IO message types (client → server)
export interface JoinMessage {
  type: 'join';
  roomId: string;
  username: string;
}

export interface SceneUpdateMessage {
  type: 'scene-update';
  elements: ExcalidrawElement[];
}

export interface CursorUpdateMessage {
  type: 'cursor-update';
  pointer: { x: number; y: number };
  username: string;
}

export interface RequestStateMessage {
  type: 'request-state';
}

export type ClientMessage =
  | JoinMessage
  | SceneUpdateMessage
  | CursorUpdateMessage
  | RequestStateMessage;

// Socket.IO message types (server → client)
export interface FullStateMessage {
  type: 'full-state';
  elements: ExcalidrawElement[];
  participants: Array<{ username: string; color: string }>;
}

export interface RemoteSceneUpdateMessage {
  type: 'scene-update';
  elements: ExcalidrawElement[];
  from: string;
}

export interface RemoteCursorUpdateMessage {
  type: 'cursor-update';
  pointer: { x: number; y: number };
  username: string;
  color: string;
}

export interface ParticipantJoinedMessage {
  type: 'participant-joined';
  username: string;
  color: string;
}

export interface ParticipantLeftMessage {
  type: 'participant-left';
  username: string;
}

export type ServerMessage =
  | FullStateMessage
  | RemoteSceneUpdateMessage
  | RemoteCursorUpdateMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage;

export interface StartOptions {
  title?: string;
  collab?: boolean;
  tunnel?: string;
  port?: number;
}

export interface OpenOptions {
  sessionId: string;
  collab?: boolean;
  tunnel?: string;
  port?: number;
}
