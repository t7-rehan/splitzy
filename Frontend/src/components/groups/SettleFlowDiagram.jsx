import React, { useState } from "react";
import { Sparkles, ArrowRight, CheckCircle2, Copy, Check, QrCode } from "lucide-react";
import { useTheme, avatarStyle } from "../../theme/clayTheme";
import { fmtMoney } from "../../services/currency";
import { ClayCard } from "../common/ClayCard";
import { ClayButton } from "../common/ClayButton";

export function SettleFlowDiagram({ members, settlements, currency, onMarkPaid, onOpenUPI, isPro, busyKey = null }) {
  const C = useTheme();
  const [copied, setCopied] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const nameOf = (id) => members.find((m) => m.id === id)?.name || "?";
  const memberById = (id) => members.find((m) => m.id === id) || null;
  const upiOf = (id) => memberById(id)?.upiId || memberById(id)?.upi || null;

  const buildShareSummary = () => {
    const lines = [`📌 ${settlements.length ? "Settlement Summary" : "All Settled Up"} — Splitzy`, ""];
    if (!settlements.length) {
      lines.push("Everyone in this group is fully settled up! ✓");
    } else {
      settlements.forEach((s) => {
        lines.push(`• ${nameOf(s.from)} pays ${nameOf(s.to)} ${fmtMoney(s.amount, currency)}`);
      });
    }
    lines.push("", "Split fair. Settle smart with Splitzy.");
    return lines.join("\n");
  };

  const handleCopyShare = async () => {
    const text = buildShareSummary();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  if (settlements.length === 0) {
    return (
      <ClayCard style={{ textAlign: "center", padding: "28px 18px", marginBottom: "20px" }}>
        <Sparkles size={28} color={C.emerald} style={{ margin: "0 auto 8px" }} />
        <div style={{ fontSize: "16px", fontWeight: "800", color: C.text }}>All settled up! ✓</div>
        <div style={{ fontSize: "12.5px", color: C.muted, marginTop: "4px", marginBottom: "12px" }}>
          Nobody owes anyone money in this group right now.
        </div>
        {currency === "INR" && onOpenUPI && (
          <button
            onClick={() => onOpenUPI({ payeeName: "", payeeUpi: "", amount: "", isFromQr: false })}
            style={{
              margin: "0 auto",
              background: "none",
              border: `1px solid ${C.emerald}`,
              backgroundColor: C.emeraldTint,
              borderRadius: "12px",
              padding: "7px 12px",
              fontSize: "12px",
              fontWeight: "700",
              color: C.emeraldDark,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <QrCode size={14} /> Upload UPI QR to Pay
          </button>
        )}
      </ClayCard>
    );
  }

  return (
    <ClayCard style={{ padding: "20px 18px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: C.muted }}>
            Smart Settlement
          </div>
          <div style={{ fontSize: "12px", color: C.mutedSoft, marginTop: "2px" }}>
            {settlements.length} simplified transfer{settlements.length === 1 ? "" : "s"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {currency === "INR" && onOpenUPI && (
            <button
              onClick={() => onOpenUPI({ payeeName: "", payeeUpi: "", amount: "", isFromQr: false })}
              style={{
                background: "none",
                border: `1px solid ${C.emerald}`,
                backgroundColor: C.emeraldTint,
                borderRadius: "12px",
                padding: "6px 10px",
                fontSize: "12px",
                fontWeight: "700",
                color: C.emeraldDark,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <QrCode size={13} /> Upload QR
            </button>
          )}

          <button
            onClick={() => setShowShare(!showShare)}
            style={{
              background: "none",
              border: `1px solid ${C.border}`,
              backgroundColor: C.bg,
              borderRadius: "12px",
              padding: "6px 10px",
              fontSize: "12px",
              fontWeight: "700",
              color: C.primary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Copy size={13} /> {showShare ? "Hide Text" : "Share"}
          </button>
        </div>
      </div>


      {/* SVG Flowchart Diagram */}
      <div style={{ width: "100%", overflowX: "auto", marginBottom: "16px", textAlign: "center" }}>
        <svg width="100%" height="160" viewBox="0 0 320 160" style={{ display: "block", margin: "0 auto" }}>
          <defs>
            <marker id="splitzy-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill={C.primary} />
            </marker>
          </defs>
          {settlements.slice(0, 3).map((s, idx) => {
            const yPos = 40 + idx * 45;
            return (
              <g key={idx}>
                {/* Debt path line */}
                <line x1="60" y1={yPos} x2="260" y2={yPos} stroke={C.primary} strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#splitzy-arrow)" opacity="0.8" />
                
                {/* Amount Pill */}
                <rect x="115" y={yPos - 12} width="90" height="24" rx="12" fill={C.card} stroke={C.primary} strokeWidth="1" />
                <text x="160" y={yPos + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={C.primary} fontFamily="Space Grotesk, sans-serif">
                  {fmtMoney(s.amount, currency)}
                </text>

                {/* From Circle Avatar */}
                <circle cx="35" cy={yPos} r="18" fill={C.primaryTint} stroke={C.border} />
                <text x="35" y={yPos + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={C.primary} fontFamily="Plus Jakarta Sans, sans-serif">
                  {(nameOf(s.from)?.charAt(0) || "?").toUpperCase()}
                </text>

                {/* To Circle Avatar */}
                <circle cx="285" cy={yPos} r="18" fill={C.emeraldTint} stroke={C.border} />
                <text x="285" y={yPos + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={C.emerald} fontFamily="Plus Jakarta Sans, sans-serif">
                  {(nameOf(s.to)?.charAt(0) || "?").toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Simplified Transfers List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" }}>
        {settlements.map((s, i) => {
          const fromName = nameOf(s.from);
          const toName = nameOf(s.to);
          const isYouDebtor = s.from === "you";
          const isYouCreditor = s.to === "you";
          const isBusy = busyKey === `${s.from}>${s.to}`;
          const settlementLabel = isYouDebtor
            ? `You owe ${toName} ${fmtMoney(s.amount, currency)}`
            : `${fromName} owes ${isYouCreditor ? "you" : toName} ${fmtMoney(s.amount, currency)}`;

          return (
            <div
              key={i}
              style={{
                backgroundColor: C.bg,
                borderRadius: "16px",
                padding: "12px 14px",
                boxShadow: C.clayPressed,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: C.text }}>
                  {settlementLabel}
                </div>
                <div style={{ fontSize: "11px", color: C.muted }}>
                  {isYouDebtor ? "Debtor: you" : `Debtor: ${fromName}`} • {isYouCreditor ? "Creditor: you" : `Creditor: ${toName}`}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="font-num" style={{ fontSize: "14px", fontWeight: "800", color: C.primary }}>
                  {fmtMoney(s.amount, currency)}
                </span>

                {/* UPI Pay CTA if debt is in INR */}
                {currency === "INR" && (
                  <button
                    onClick={() => {
                      const creditor = memberById(s.to);
                      const creditorName = isYouCreditor ? "You" : toName;
                      const creditorUpi = upiOf(s.to);
                      onOpenUPI({
                        payeeName: creditorName,
                        payeeUpi: creditorUpi || "",
                        amount: s.amount,
                        note: `Settlement payment to ${creditorName}`,
                        missingUpi: !creditorUpi,
                      });
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "10px",
                      backgroundColor: C.emeraldTint,
                      color: C.emeraldDark,
                      border: `1px solid ${C.emerald}`,
                      fontSize: "11px",
                      fontWeight: "700",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <QrCode size={12} /> Pay ₹{s.amount}
                  </button>
                )}

                {/* Mark as Paid CTA (disabled while the request is in flight) */}
                <button
                  onClick={() => onMarkPaid(s)}
                  disabled={busyKey !== null}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "10px",
                    backgroundColor: C.primary,
                    color: "#FFF",
                    border: "none",
                    fontSize: "11px",
                    fontWeight: "700",
                    cursor: busyKey ? "default" : "pointer",
                    opacity: busyKey ? (isBusy ? 1 : 0.55) : 1,
                  }}
                >
                  {isBusy ? "..." : "Settle"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Share Summary Box */}
      {showShare && (
        <div style={{ marginTop: "14px" }}>
          <textarea
            readOnly
            value={buildShareSummary()}
            style={{
              width: "100%",
              height: "100px",
              padding: "10px 12px",
              borderRadius: "12px",
              border: `1px solid ${C.border}`,
              backgroundColor: C.bg,
              fontSize: "12px",
              fontFamily: "monospace",
              color: C.text,
              resize: "none",
              marginBottom: "8px",
            }}
          />
          <ClayButton variant="secondary" size="sm" fullWidth onClick={handleCopyShare}>
            {copied ? <Check size={16} color={C.emerald} /> : <Copy size={16} />}
            {copied ? "Copied to Clipboard!" : "Copy Summary for WhatsApp"}
          </ClayButton>
        </div>
      )}
    </ClayCard>
  );
}
