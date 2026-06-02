import React from 'react';
import GameCanvas from './components/GameCanvas';

export default function App() {
  return (
    <div className="w-full h-screen overflow-hidden bg-slate-900 text-white">
      <GameCanvas />
    </div>
  );
}