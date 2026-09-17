import React, { useState } from "react";
import { Share2, Copy, Check, Link, MessageCircle } from "lucide-react";
import { BottomSheet } from "../common/BottomSheet";
import { ClayButton } from "../common/ClayButton";
import { useTheme } from "../../theme/clayTheme";

export function GroupLinkModal({ isOpen, onClose, group }) {
  const C = useTheme();
  const [copied, setCopied] = useState(false);

  if (!group) return null;

  const joinLink = `https://splitzy.app/join/${group.id}?code=${group.id.slice(0, 6)}`;
  const shareMessage = `Join "${group.name}" on Splitzy to track and split shared expenses together:\n\n${joinLink}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleShareWhatsApp = () => {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`;
    window.open(waUrl, "_blank");
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Invite to Group" subtitle={group.name}>
      <div style={{ textAlign: "center", padding: "10px 4px 10px" }} className="animate-fade-in">
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "20px",
            backgroundColor: C.primaryTint,
            color: C.primary,
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Link size={28} />
        </div>

        <div style={{ fontSize: "14px", fontWeight: "700", color: C.text, marginBottom: "4px" }}>
          Share Join Link with Friends
        </div>
        <div style={{ fontSize: "12.5px", color: C.muted, marginBottom: "20px" }}>
          Anyone with this link can join {group.name} and log expenses.
        </div>

        {/* Link Box */}
        <div
          style={{
            backgroundColor: C.bg,
            borderRadius: "16px",
            padding: "14px",
            boxShadow: C.clayPressed,
            fontSize: "13px",
            fontWeight: "600",
            color: C.primary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: "16px",
          }}
        >
          {joinLink}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <ClayButton fullWidth size="lg" onClick={handleCopyLink} icon={copied ? <Check size={18} color={C.emerald} /> : <Copy size={18} />}>
            {copied ? "Link Copied!" : "Copy Link to Clipboard"}
          </ClayButton>

          <ClayButton
            variant="secondary"
            fullWidth
            size="lg"
            onClick={handleShareWhatsApp}
            icon={<MessageCircle size={18} color="#25D366" />}
          >
            Share via WhatsApp
          </ClayButton>
        </div>
      </div>
    </BottomSheet>
  );
}
