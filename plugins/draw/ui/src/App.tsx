import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { CollabClient } from './collab/client';

function getUrlParams(): { room: string; name: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    room: params.get('room') || 'default',
    name: params.get('name') || '',
  };
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check localStorage for saved name
    const saved = localStorage.getItem('crab-draw-name');
    if (saved) {
      onSubmit(saved);
      return;
    }
    inputRef.current?.focus();
  }, [onSubmit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      localStorage.setItem('crab-draw-name', trimmed);
      onSubmit(trimmed);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#f5f5f5',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'white',
        padding: '32px',
        borderRadius: '12px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
        textAlign: 'center',
      }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '20px' }}>Crab Draw</h2>
        <p style={{ margin: '0 0 20px 0', color: '#666', fontSize: '14px' }}>
          Enter your name to join the session
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          style={{
            padding: '10px 16px',
            fontSize: '16px',
            border: '2px solid #ddd',
            borderRadius: '8px',
            outline: 'none',
            width: '200px',
          }}
        />
        <br />
        <button
          type="submit"
          disabled={!name.trim()}
          style={{
            marginTop: '16px',
            padding: '10px 32px',
            fontSize: '16px',
            background: name.trim() ? '#FF6B6B' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: name.trim() ? 'pointer' : 'default',
          }}
        >
          Join
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const { room, name: urlName } = getUrlParams();
  const [username, setUsername] = useState<string>(urlName || '');
  const [initialData, setInitialData] = useState<{ elements: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const collabRef = useRef<CollabClient | null>(null);
  const [collaborators, setCollaborators] = useState<Map<string, any>>(new Map());

  const handleNameSubmit = useCallback((name: string) => {
    setUsername(name);
  }, []);

  // Fetch initial scene BEFORE mounting Excalidraw
  useEffect(() => {
    fetch('/api/scene')
      .then((res) => res.json())
      .then((data) => {
        if (data.elements && data.elements.length > 0) {
          setInitialData({ elements: data.elements });
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // Initialize collab once we have a username and excalidraw API
  useEffect(() => {
    if (!username || loading || !excalidrawApiRef.current) return;

    const api = excalidrawApiRef.current;
    const collab = new CollabClient({
      roomId: room,
      username,
      onRemoteSceneUpdate: (elements) => {
        api.updateScene({ elements });
      },
      onCollaboratorsChange: (collabs) => {
        setCollaborators(new Map(collabs));
      },
    });

    collabRef.current = collab;
    collab.connect();

    return () => {
      collab.disconnect();
    };
  }, [username, loading, room]);

  // Handle scene changes
  const handleChange = useCallback(
    (elements: readonly any[], _appState: any) => {
      if (collabRef.current) {
        collabRef.current.handleLocalChange(elements as any[]);
      }
    },
    [],
  );

  // Handle pointer/cursor movement
  const handlePointerUpdate = useCallback(
    (payload: { pointer: { x: number; y: number } }) => {
      if (collabRef.current) {
        collabRef.current.sendCursorUpdate(payload.pointer);
      }
    },
    [],
  );

  if (!username) {
    return <NamePrompt onSubmit={handleNameSubmit} />;
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'system-ui, sans-serif', color: '#666',
      }}>
        Loading drawing...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Excalidraw
        excalidrawAPI={(api) => {
          excalidrawApiRef.current = api;
        }}
        initialData={initialData || undefined}
        onChange={handleChange}
        onPointerUpdate={handlePointerUpdate}
        isCollaborating={true}
        name={`Crab Draw - ${room}`}
      />
    </div>
  );
}
