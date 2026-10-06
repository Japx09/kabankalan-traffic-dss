'use client';

import React, { Component, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { RotateCcw, Box } from 'lucide-react';

const Scene = dynamic(() => import('@/components/three/Scene'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#0f0f1a] rounded-xl">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Initializing 3D Simulation Canvas...</p>
      </div>
    </div>
  ),
});

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class WebGLErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('[WebGLErrorBoundary] Caught WebGL/Canvas error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-[#0d121f] rounded-xl p-6 text-center border border-amber-500/30">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-3">
            <Box className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">
            WebGL Context Recovery
          </h3>
          <p className="text-xs text-gray-400 max-w-md mb-4 leading-relaxed">
            The browser GPU context was temporarily reset or busy. Click the button below to cleanly reinitialize the 3D isometric simulation.
          </p>
          <button
            onClick={this.handleRetry}
            className="btn-primary text-xs flex items-center gap-2 px-4 py-2"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restore 3D Simulation Canvas
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function SimulationCanvas() {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-white/10 relative">
      <WebGLErrorBoundary>
        <Scene />
      </WebGLErrorBoundary>
    </div>
  );
}
