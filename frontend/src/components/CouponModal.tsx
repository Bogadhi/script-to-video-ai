"use client";

import { useState } from "react";
import { API_BASE, fetchWithSessionHandling, getAuthHeaders } from "@/lib/api";

function extractCoupon(input: string) {
  const match = input.match(/[A-Z0-9]{5,}/i);
  return match ? match[0].toUpperCase() : input.toUpperCase();
}

export default function CouponModal({ onPlanUpdated, onClose }: { onPlanUpdated: (newPlan: string) => void, onClose: () => void }) {
  const [couponCode, setCouponCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [showAnimation, setShowAnimation] = useState(false);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    const finalCode = extractCoupon(couponCode);
    setCouponCode(finalCode);

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetchWithSessionHandling(`${API_BASE}/api/credits/redeem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ coupon: finalCode }),
      });
      if (res.status === 401) {
        return;
      }

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        throw new Error("This code is invalid or expired");
      }

      // Success feedback
      setStatus("success");
      setMessage("Coupon applied successfully!");
      
      // Brief pause
      setTimeout(() => {
        setMessage("You've unlocked 1 month free trial 🎉");
        if (!localStorage.getItem("reward_shown")) {
          setShowAnimation(true);
          localStorage.setItem("reward_shown", "true");
        }
      }, 600);
      
      if (data.plan_id || data.plan) {
        onPlanUpdated(data.plan_id || data.plan);
      }

      setTimeout(() => {
        setShowAnimation(false);
        onClose();
      }, 4000);

    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="modal-overlay">
      <div className={`modal-content ${status === "success" ? "success-glow" : ""}`}>
        
        {status !== "success" && (
          <button className="modal-close" onClick={onClose}>&times;</button>
        )}

        {!showAnimation ? (
          <>
            <div className="modal-header">
              <div className="modal-icon">🎁</div>
              <h2>Welcome to ScriptToVideo!</h2>
              <p>Unlock premium features and scale your channel.</p>
            </div>

            <form onSubmit={handleApply} className="modal-form">
              <input
                type="text"
                placeholder="Enter coupon code"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value);
                  setStatus("idle");
                  setMessage("");
                }}
                disabled={status === "loading" || status === "success"}
                className="textarea"
                style={{ minHeight: "44px", padding: "10px 14px", textAlign: "center", fontSize: "16px", letterSpacing: "1px", textTransform: "uppercase" }}
              />

              {status === "error" && (
                <div style={{ padding: "8px", marginTop: "16px", fontSize: "13px", textAlign: "center", color: "#f87171", background: "rgba(248, 113, 113, 0.1)", borderRadius: "6px" }}>
                  ⚠️ {message}
                </div>
              )}
              {status === "success" && !showAnimation && (
                <div style={{ padding: "8px", marginTop: "16px", fontSize: "14px", textAlign: "center", color: "var(--success)" }}>
                  ✅ {message}
                </div>
              )}

              <button
                type="submit"
                disabled={!couponCode.trim() || status === "loading" || status === "success"}
                className={`btn btn-primary btn-lg btn-full ${status === "loading" ? "loading" : ""}`}
                style={{ marginTop: "16px", position: "relative" }}
              >
                {status === "loading" ? "Applying..." : "Apply Coupon"}
              </button>
            </form>
            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button 
                onClick={onClose} 
                className="btn btn-secondary" 
                style={{ fontSize: "12px", background: "none", border: "none" }}
              >
                Maybe later
              </button>
            </div>
          </>
        ) : (
          <div className="animation-container">
            <div className="gift-box-animation">
              <div className="gift-box">
                <div className="gift-lid"></div>
                <div className="gift-body"></div>
              </div>
              <div className="confetti-burst"></div>
            </div>
            <h3 className="unlock-message">{message}</h3>
          </div>
        )}
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: fadeIn 0.3s ease;
        }

        .modal-content {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 32px;
          width: 90%;
          max-width: 400px;
          position: relative;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          transition: all 0.3s ease;
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .success-glow {
          box-shadow: 0 0 40px rgba(124, 106, 247, 0.4);
          border-color: var(--accent);
        }

        .modal-close {
          position: absolute;
          top: 16px; right: 16px;
          background: none; border: none;
          color: var(--text-muted);
          font-size: 24px; cursor: pointer;
          transition: color 0.2s;
        }
        .modal-close:hover { color: var(--text-primary); }

        .modal-header { text-align: center; margin-bottom: 24px; }
        .modal-icon { font-size: 48px; margin-bottom: 12px; animation: bounce 2s infinite ease-in-out; }
        .modal-header h2 { font-size: 22px; margin-bottom: 8px; font-weight: 800; letter-spacing: -0.5px; }
        .modal-header p { color: var(--text-secondary); font-size: 14px; }

        .animation-container {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 250px; text-align: center;
        }

        /* Gift Box Animation */
        .gift-box-animation {
          position: relative; width: 100px; height: 100px; margin-bottom: 30px;
        }
        .gift-box {
          position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
          width: 80px; height: 70px;
        }
        .gift-body {
          position: absolute; bottom: 0; width: 80px; height: 60px;
          background: linear-gradient(135deg, #ff4081, #d500f9);
          border-radius: 4px; box-shadow: inset 0 0 20px rgba(0,0,0,0.2);
          animation: boxShake 0.5s ease 0.5s;
        }
        .gift-body::before { /* Ribbon vertical */
          content: ""; position: absolute; left: 50%; transform: translateX(-50%);
          width: 15px; height: 100%; background: #fff;
        }
        .gift-lid {
          position: absolute; top: 0; left: -5px; width: 90px; height: 20px;
          background: linear-gradient(135deg, #ff80ab, #e040fb);
          border-radius: 4px; z-index: 2;
          transform-origin: top right;
          animation: lidOpen 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) 1s forwards;
        }
        .gift-lid::before { /* Ribbon vertical on lid */
          content: ""; position: absolute; left: 50%; transform: translateX(-50%);
          width: 15px; height: 100%; background: #fff;
        }

        .confetti-burst {
          position: absolute; top: 50%; left: 50%; width: 1px; height: 1px;
          background: transparent;
          box-shadow: none;
          animation: confettiPop 0.8s ease-out 1.1s forwards;
          opacity: 0;
        }

        .unlock-message {
          font-size: 20px; font-weight: 800; color: var(--text-primary);
          background: linear-gradient(90deg, #bb86fc, #e05aee); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          opacity: 0; transform: translateY(20px);
          animation: textPopUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 1.2s forwards;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        
        @keyframes boxShake {
          0%, 100% { transform: translateX(-50%) rotate(0deg); }
          25% { transform: translateX(-50%) rotate(-5deg); }
          50% { transform: translateX(-50%) rotate(5deg); }
          75% { transform: translateX(-50%) rotate(-5deg); }
        }
        
        @keyframes lidOpen {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-30px, -40px) rotate(-30deg); opacity: 0; }
        }

        @keyframes confettiPop {
          0% { opacity: 1; box-shadow: 0 0 0 0 #ffeb3b, 0 0 0 0 #00e676, 0 0 0 0 #2196f3, 0 0 0 0 #e91e63, 0 0 0 0 #9c27b0; }
          100% { opacity: 0; box-shadow: -40px -60px 0 2px #ffeb3b, 40px -50px 0 2px #00e676, -20px -80px 0 2px #2196f3, 20px -70px 0 2px #e91e63, 0 -90px 0 2px #9c27b0; }
        }

        @keyframes textPopUp {
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
