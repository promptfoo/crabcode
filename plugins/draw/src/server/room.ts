import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type {
  ExcalidrawElement,
  ClientInfo,
  RoomState,
} from '../types.js';

const CURSOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
];

export interface RoomServer {
  io: SocketIOServer;
  getElements: () => ExcalidrawElement[];
  getParticipants: () => string[];
  close: () => void;
}

export function createRoomServer(
  httpServer: http.Server,
  sessionId: string,
  initialElements: ExcalidrawElement[],
): RoomServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    maxHttpBufferSize: 10e6, // 10MB for large drawings
  });

  const room: RoomState = {
    sessionId,
    elements: [...initialElements],
    clients: new Map(),
  };

  let colorIndex = 0;

  function nextColor(): string {
    const color = CURSOR_COLORS[colorIndex % CURSOR_COLORS.length];
    colorIndex++;
    return color;
  }

  io.on('connection', (socket) => {
    let clientInfo: ClientInfo | null = null;

    socket.on('join', (data: { roomId: string; username: string }) => {
      const { username } = data;
      const color = nextColor();

      clientInfo = {
        socketId: socket.id,
        username,
        color,
        cursor: { x: 0, y: 0 },
      };
      room.clients.set(socket.id, clientInfo);

      socket.join(sessionId);

      // Send current state to the new joiner
      socket.emit('full-state', {
        type: 'full-state',
        elements: room.elements,
        participants: Array.from(room.clients.values()).map((c) => ({
          username: c.username,
          color: c.color,
        })),
      });

      // Notify others
      socket.to(sessionId).emit('participant-joined', {
        type: 'participant-joined',
        username,
        color,
      });
    });

    socket.on('scene-update', (data: { elements: ExcalidrawElement[] }) => {
      if (!clientInfo) return;

      // Merge incoming elements into room state
      const elementMap = new Map<string, ExcalidrawElement>();
      for (const el of room.elements) {
        elementMap.set(el.id, el);
      }
      for (const el of data.elements) {
        const existing = elementMap.get(el.id);
        if (!existing || el.version > existing.version) {
          elementMap.set(el.id, el);
        }
      }
      room.elements = Array.from(elementMap.values());

      // Relay to other clients
      socket.to(sessionId).emit('scene-update', {
        type: 'scene-update',
        elements: data.elements,
        from: clientInfo.username,
      });
    });

    socket.on('cursor-update', (data: { pointer: { x: number; y: number } }) => {
      if (!clientInfo) return;
      clientInfo.cursor = data.pointer;

      socket.to(sessionId).emit('cursor-update', {
        type: 'cursor-update',
        pointer: data.pointer,
        username: clientInfo.username,
        color: clientInfo.color,
      });
    });

    socket.on('request-state', () => {
      socket.emit('full-state', {
        type: 'full-state',
        elements: room.elements,
        participants: Array.from(room.clients.values()).map((c) => ({
          username: c.username,
          color: c.color,
        })),
      });
    });

    socket.on('disconnect', () => {
      if (clientInfo) {
        room.clients.delete(socket.id);
        socket.to(sessionId).emit('participant-left', {
          type: 'participant-left',
          username: clientInfo.username,
        });
      }
    });
  });

  return {
    io,
    getElements: () => room.elements,
    getParticipants: () =>
      Array.from(room.clients.values()).map((c) => c.username),
    close: () => {
      io.close();
    },
  };
}
