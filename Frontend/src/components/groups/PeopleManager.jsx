import React, { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, AlertCircle } from "lucide-react";
import { avatarStyle, useTheme } from "../../theme/clayTheme";
import { validateRemoveMember } from "../../services/validation";
import { checkCanAddMember } from "../../services/proService";

export function PeopleManager({ group, onUpdateGroup, isPro, onShowProUpgrade, onErrorToast, onSearchUsers, onAddMember, onRemoveServerMember }) {
  const { theme } = useTheme();
  const [newMemberName, setNewMemberName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [usernameQuery, setUsernameQuery] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [memberActionBusy, setMemberActionBusy] = useState(false);

  const isServerGroup = Boolean(group.isServerGroup && onSearchUsers && onAddMember);

  const handleSearch = async (e) => {
    e.preventDefault();
    setWarningMessage("");
    setSearchResult(null);
    setSearching(true);
    try {
      setSearchResult(await onSearchUsers(usernameQuery));
    } catch (error) {
      setWarningMessage(error?.userMessage || "No Splitzy user found with this username.");
    } finally {
      setSearching(false);
    }
  };

  const handleAddServerMember = async () => {
    if (!searchResult || memberActionBusy) return;
    setMemberActionBusy(true);
    try {
      await onAddMember(searchResult.username);
      setUsernameQuery("");
      setSearchResult(null);
      setWarningMessage("");
    } catch (error) {
      setWarningMessage(error?.userMessage || "Could not add this member.");
    } finally {
      setMemberActionBusy(false);
    }
  };

  const handleAddMember = (e) => {
    e.preventDefault();
    setWarningMessage("");
    const trimmed = newMemberName.trim();
    if (!trimmed) return;

    // Check free limit for members
    const limitCheck = checkCanAddMember(group.members.length, isPro);
    if (!limitCheck.allowed) {
      onShowProUpgrade(limitCheck.reason);
      return;
    }

    const newMember = {
      id: "m_" + Date.now(),
      name: trimmed,
      upi: `${trimmed.toLowerCase().replace(/\s+/g, "")}@upi`,
    };

    onUpdateGroup({
      ...group,
      members: [...group.members, newMember],
    });

    setNewMemberName("");
  };

  const handleStartRename = (member) => {
    setEditingId(member.id);
    setEditingName(member.name);
  };

  const handleSaveRename = () => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }

    onUpdateGroup({
      ...group,
      members: group.members.map((m) => (m.id === editingId ? { ...m, name: trimmed } : m)),
    });

    setEditingId(null);
  };

  const handleRemoveMember = (memberId) => {
    setWarningMessage("");
    const validation = validateRemoveMember(group, memberId);

    if (!validation.valid) {
      setWarningMessage(validation.error);
      if (onErrorToast) onErrorToast(validation.error);
      return;
    }

    // Cleanly remove member and clean up equal/percentage/itemized splits
    const updatedMembers = group.members.filter((m) => m.id !== memberId);
    const updatedExpenses = group.expenses.map((e) => {
      if (e.splitType === "equal") {
        return { ...e, participants: (e.participants || []).filter((id) => id !== memberId) };
      }
      if (e.splitType === "percentage") {
        const p = { ...(e.percentages || {}) };
        delete p[memberId];
        return { ...e, percentages: p };
      }
      if (e.splitType === "itemized") {
        return {
          ...e,
          items: (e.items || []).map((it) => ({
            ...it,
            participants: (it.participants || []).filter((id) => id !== memberId),
          })),
        };
      }
      return e;
    });

    onUpdateGroup({
      ...group,
      members: updatedMembers,
      expenses: updatedExpenses,
    });
  };

  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted, marginBottom: "10px" }}>
        People in Group ({group.members.length})
      </div>

      {warningMessage && (
        <div
          style={{
            backgroundColor: theme.coralTint,
            border: `1px solid ${theme.coral}`,
            borderRadius: "14px",
            padding: "10px 14px",
            marginBottom: "12px",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            fontSize: "12.5px",
            color: theme.coralDark,
            fontWeight: "600",
          }}
        >
          <AlertCircle size={16} color={theme.coral} style={{ flexShrink: 0, marginTop: "2px" }} />
          <span>{warningMessage}</span>
        </div>
      )}

      {/* Member pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
        {group.members.map((m, idx) => {
          const isYou = m.id === "you" || m.isCurrentUser;
          const isEditing = editingId === m.id;
          const av = avatarStyle(idx);

          return (
            <div
              key={m.id}
              style={{
                backgroundColor: theme.card,
                borderRadius: "20px",
                padding: isEditing ? "4px 8px" : "6px 12px 6px 6px",
                border: `1px solid ${theme.borderLight}`,
                boxShadow: theme.clayRaisedSm,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {isEditing ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{
                      width: "80px",
                      padding: "4px 8px",
                      borderRadius: "8px",
                      border: `1.5px solid ${theme.primary}`,
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      fontSize: "12.5px",
                    }}
                  />
                  <button onClick={handleSaveRename} style={{ background: "none", border: "none", color: theme.emerald, cursor: "pointer", padding: 0 }}>
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", color: theme.muted, cursor: "pointer", padding: 0 }}>
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      backgroundColor: av.bg,
                      color: av.text,
                      fontSize: "11px",
                      fontWeight: "700",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {(m?.name?.trim()?.charAt(0) || "M").toUpperCase()}
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: theme.text }}>
                    {m.name}
                    {isYou && <span style={{ color: theme.muted, fontWeight: "500" }}> • You</span>}
                    {m.username && <span style={{ display: "block", color: theme.muted, fontSize: "11px", fontWeight: "500" }}>@{m.username}</span>}
                  </span>
                  <span style={{ fontSize: "10px", color: theme.muted, fontWeight: "700", textTransform: "uppercase" }}>
                    {isYou ? "Admin" : (m.role || "Member")}
                  </span>

                  {!isYou && !isServerGroup && (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "4px" }}>
                      <button
                        onClick={() => handleStartRename(m)}
                        style={{ background: "none", border: "none", color: theme.mutedSoft, cursor: "pointer", padding: "2px" }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        style={{ background: "none", border: "none", color: theme.mutedSoft, cursor: "pointer", padding: "2px" }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                  {!isYou && isServerGroup && onRemoveServerMember && (
                    <button
                      onClick={async () => {
                        setMemberActionBusy(true);
                        try { await onRemoveServerMember(m); } catch (error) { setWarningMessage(error?.userMessage || "Could not remove this member."); }
                        finally { setMemberActionBusy(false); }
                      }}
                      disabled={memberActionBusy}
                      style={{ background: "none", border: "none", color: theme.mutedSoft, cursor: "pointer", padding: "2px" }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Server-backed username search */}
      {isServerGroup ? (
        <div>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              placeholder="@username"
              value={usernameQuery}
              onChange={(e) => setUsernameQuery(e.target.value)}
              style={{ flex: 1, padding: "10px 14px", borderRadius: "14px", border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, boxShadow: theme.clayPressed, fontSize: "13.5px", color: theme.text }}
            />
            <button type="submit" disabled={searching} style={{ padding: "10px 16px", borderRadius: "14px", backgroundColor: theme.primary, color: "#FFF", border: "none", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>
              {searching ? "Searching..." : "Search"}
            </button>
          </form>
          {searchResult && (
            <div style={{ marginTop: "10px", padding: "10px 12px", border: `1px solid ${theme.borderLight}`, borderRadius: "14px", backgroundColor: theme.card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <div><strong>{searchResult.name}</strong><div style={{ color: theme.muted, fontSize: "12px" }}>@{searchResult.username}</div></div>
              <button type="button" onClick={handleAddServerMember} disabled={memberActionBusy} style={{ padding: "7px 10px", borderRadius: "10px", backgroundColor: theme.emerald, color: "#FFF", border: "none", fontWeight: "700", fontSize: "11px", cursor: "pointer" }}>{memberActionBusy ? "Adding..." : "Add to Group"}</button>
            </div>
          )}
        </div>
      ) : <form onSubmit={handleAddMember} style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          placeholder="Add a person to group"
          value={newMemberName}
          onChange={(e) => setNewMemberName(e.target.value)}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "14px",
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.inputBg,
            boxShadow: theme.clayPressed,
            fontSize: "13.5px",
            color: theme.text,
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 16px",
            borderRadius: "14px",
            backgroundColor: theme.primary,
            color: "#FFF",
            border: "none",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
            boxShadow: theme.clayRaisedSm,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Plus size={16} /> Add
        </button>
      </form>}
    </div>
  );
}
