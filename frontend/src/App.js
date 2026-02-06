import { useState, useEffect } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/components/ThemeProvider';
import Landing from '@/pages/Landing';
import Reader from '@/pages/Reader';
import Library from '@/pages/Library';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="flowread-theme">
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/reader/:docId" element={<Reader />} />
            <Route path="/library" element={<Library />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" />
      </div>
    </ThemeProvider>
  );
}

export default App;