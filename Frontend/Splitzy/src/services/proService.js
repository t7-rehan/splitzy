export const FREE_LIMITS = {
  MAX_GROUPS: 5,
  MAX_MEMBERS_PER_GROUP: 6,
};

export const PRO_FEATURES = [
  { id: "unlimited_groups", title: "Unlimited Groups", desc: "Create as many trip, house, or project groups as you need." },
  { id: "unlimited_members", title: "Unlimited Members", desc: "Add larger friend circles without any cap." },
  { id: "smart_settlement", title: "Smart Settlement", desc: "Automatically simplify complex debts into minimum payment transactions." },
  { id: "upi_payments", title: "UPI Payment Deep Links", desc: "One-tap UPI payments & QR code generation for instant debt settlement." },
  { id: "advanced_analytics", title: "Advanced Analytics", desc: "Monthly comparisons, category trends, and person-wise spending insights." },
  { id: "shared_access", title: "Shared Group Access", desc: "Generate join links so friends can add expenses themselves." },
  { id: "roommate_mode", title: "Roommate Mode", desc: "Dedicated household hub for recurring rent, utilities, and monthly shares." },
];

export function checkCanCreateGroup(currentGroupCount, isPro) {
  if (isPro) return { allowed: true };
  if (currentGroupCount >= FREE_LIMITS.MAX_GROUPS) {
    return {
      allowed: false,
      reason: `Free tier limit reached (${FREE_LIMITS.MAX_GROUPS} active groups max). Upgrade to Splitzy Pro for unlimited groups.`,
    };
  }
  return { allowed: true };
}

export function checkCanAddMember(currentMemberCount, isPro) {
  if (isPro) return { allowed: true };
  if (currentMemberCount >= FREE_LIMITS.MAX_MEMBERS_PER_GROUP) {
    return {
      allowed: false,
      reason: `Free tier limit reached (${FREE_LIMITS.MAX_MEMBERS_PER_GROUP} members max per group). Upgrade to Splitzy Pro for unlimited members.`,
    };
  }
  return { allowed: true };
}
