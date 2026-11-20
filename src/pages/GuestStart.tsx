import React, { useState } from "react";

interface GuestStartProps { onGetStarted: () => Promise<void>; checkingSession?: boolean }

const GuestStart: React.FC<GuestStartProps> = ({ onGetStarted, checkingSession = false }) => {
  const [videoError, setVideoError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleGetStarted() {
    if (checking || checkingSession) return;
    setChecking(true);
    try { await onGetStarted(); } finally { setChecking(false); }
  }

  return (
    <div className="guest-page">

      <style>{`
        * {
          box-sizing: border-box;
        }

        html, body, #root {
          margin: 0;
          width: 100%;
          min-height: 100%;
        }

        .guest-page {
          width: 100%;
          height: 100vh;
          height: 100dvh;
          position: relative;
          overflow: hidden;
          font-family: Arial, sans-serif;
          color: white;
          background: #000;
        }

        .guest-bg-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
        }

        .guest-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(0,0,0,0.45),
            rgba(0,0,0,0.10) 45%,
            rgba(0,0,0,0.55)
          );
          z-index: 1;
          pointer-events: none;
        }

        .guest-header {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          padding: 25px 6%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 2;
        }

        .guest-logo {
          font-size: 25px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .guest-logo span {
          color: #b7e49a;
        }

        .guest-actions {
          display: flex;
          align-items: center;
          gap: 22px;
        }

        .guest-actions select {
          background: transparent;
          color: white;
          border: none;
          font-size: 15px;
          outline: none;
          cursor: pointer;
        }

        .guest-actions select option {
          color: black;
        }

        .login-link {
          color: white;
          text-decoration: none;
          font-size: 15px;
          font-weight: 600;
        }

        .guest-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          width: 90%;
          z-index: 2;
        }

        .get-started-btn {
          display: inline-block;
          padding: 17px 55px;
          background: #75b84a;
          color: white;
          border-radius: 40px;
          font-size: 18px;
          font-weight: bold;
          text-decoration: none;
          cursor: pointer;
          transition: 0.3s;
          box-shadow: 0 8px 25px rgba(0,0,0,0.25);
          border: 0;
          font-family: inherit;
        }

        .get-started-btn:hover {
          background: #5b9d35;
          transform: translateY(-3px);
        }

        .get-started-btn:disabled {
          cursor: wait;
          opacity: 0.8;
        }

        .video-error {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 3;
          color: white;
          background: #a00000;
          padding: 10px 15px;
          border-radius: 8px;
          font-size: 13px;
        }

        @media (max-width: 600px) {
          .guest-header {
            padding: 20px;
          }

          .guest-logo {
            font-size: 19px;
          }

          .guest-actions {
            gap: 12px;
          }

          .guest-actions select,
          .login-link {
            font-size: 13px;
          }

          .get-started-btn {
            padding: 15px 42px;
            font-size: 16px;
          }
        }
      `}</style>

      {/* BACKGROUND VIDEO */}

      <video
        className="guest-bg-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onError={() => setVideoError(true)}
        onCanPlay={() => setVideoError(false)}
      >
        <source
          src="/WhatsApp%20Video%202026-11-14%20at%207.16.07%20PM.mp4"
          type="video/mp4"
        />

        Your browser does not support video.
      </video>

      {/* VIDEO ERROR */}

      {videoError && (
        <div className="video-error">
          Video could not load. Please check video file path.
        </div>
      )}

      {/* OVERLAY */}

      <div className="guest-overlay"></div>

      {/* HEADER */}

      <header className="guest-header">

        <div className="guest-logo">
          KHETIGO<span>.</span>
        </div>

        <div className="guest-actions">

          <select defaultValue="English">
            <option value="English">English</option>
            <option value="తెలుగు">తెలుగు</option>
            <option value="Hindi">Hindi</option>
          </select>

          <a href="/login" className="login-link">
            Log in
          </a>

        </div>

      </header>

      {/* GET STARTED BUTTON */}

      <main className="guest-center">

        <button type="button" className="get-started-btn" onClick={() => void handleGetStarted()} disabled={checking || checkingSession}>
          {checking || checkingSession ? 'Checking your session…' : 'Get Started →'}
        </button>

      </main>

    </div>
  );
};

export default GuestStart;
