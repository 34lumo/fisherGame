"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import GameCanvas from "@/components/GameCanvas";

export default function Home() {
  const [showIntro, setShowIntro] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const dismissIntro = useCallback(() => {
    if (!showIntro || fadeOut) return;
    setFadeOut(true);
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setTimeout(() => setShowIntro(false), 600);
  }, [showIntro, fadeOut]);

  useEffect(() => {
    if (!showIntro) return;

    const handleKey = (e: KeyboardEvent) => {
      e.preventDefault();
      dismissIntro();
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showIntro, dismissIntro]);

  return (
    <main className="relative w-screen h-screen bg-black overflow-hidden">
      {/* Game canvas — always mounted but hidden behind intro */}
      <div className={showIntro ? "invisible" : "visible"} style={{ width: "100%", height: "100%" }}>
        <GameCanvas />
      </div>

      {/* Intro overlay */}
      {showIntro && (
        <div
          onClick={dismissIntro}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backgroundColor: "#000",
            opacity: fadeOut ? 0 : 1,
            transition: "opacity 0.6s ease-out",
          }}
        >
          {/* Video background */}
          <video
            ref={videoRef}
            src="/Animación_de_Imagen_Generada.mp4"
            autoPlay
            muted
            loop
            playsInline
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />

          {/* Dark overlay for text readability */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.6) 100%)",
              pointerEvents: "none",
            }}
          />

          {/* Title + prompt */}
          <div
            style={{
              position: "absolute",
              bottom: "15%",
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
              padding: "0 1rem",
            }}
          >
            {/* Blinking prompt */}
            <div
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "clamp(1rem, 2vw, 1.5rem)",
                color: "#ffffff",
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                padding: "1rem 2rem",
                borderRadius: "8px",
                border: "2px solid rgba(255, 255, 255, 0.3)",
                textShadow: "2px 2px 0 #000",
                animation: "blink 1.5s ease-in-out infinite",
                boxShadow: "0 4px 15px rgba(0,0,0,0.5)",
              }}
            >
              Pulsa cualquier tecla para empezar
            </div>
          </div>

          {/* Blink animation */}
          <style>{`
            @keyframes blink {
              0%, 100% { opacity: 1; }
              50%      { opacity: 0.25; }
            }
          `}</style>
        </div>
      )}
    </main>
  );
}
