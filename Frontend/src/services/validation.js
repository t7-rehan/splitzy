export function validateExpenseData({ desc, amount, splitType, participants, percentages, items, paidBy }) {
  if (!desc || !desc.trim()) {
    return { valid: false, error: "Please enter a description for the expense." };
  }
  if (!paidBy) {
    return { valid: false, error: "Please select who paid for this expense." };
  }

  if (splitType === "equal") {
    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      return { valid: false, error: "Expense amount must be greater than zero." };
    }
    if (!participants || participants.length === 0) {
      return { valid: false, error: "Select at least one person to split with." };
    }
  } else if (splitType === "percentage") {
    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      return { valid: false, error: "Expense amount must be greater than zero." };
    }
    const pctTotal = Object.values(percentages || {}).reduce((sum, p) => sum + (parseFloat(p) || 0), 0);
    if (Math.abs(pctTotal - 100) > 0.01) {
      return { valid: false, error: `Percentages must add up to 100%. Current sum: ${pctTotal.toFixed(1)}%.` };
    }
  } else if (splitType === "itemized") {
    if (!items || items.length === 0) {
      return { valid: false, error: "Add at least one item to the itemized split." };
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.name || !it.name.trim()) {
        return { valid: false, error: `Item #${i + 1} needs a name.` };
      }
      if (!it.price || parseFloat(it.price) <= 0) {
        return { valid: false, error: `Item "${it.name}" must have a valid price.` };
      }
      if (!it.participants || it.participants.length === 0) {
        return { valid: false, error: `Select who shared item "${it.name}".` };
      }
    }
  }

  return { valid: true };
}

export function validateRemoveMember(group, memberId) {
  if (memberId === "you") {
    return { valid: false, error: "You cannot remove yourself from your own profile in this group." };
  }
  if (group.members.length <= 2) {
    return { valid: false, error: "A group must have at least 2 people." };
  }
  const isPayer = group.expenses.some((e) => e.paidBy === memberId);
  if (isPayer) {
    const memberName = group.members.find((m) => m.id === memberId)?.name || "This person";
    return {
      valid: false,
      error: `Can't remove ${memberName} yet. ${memberName} has paid for existing expenses in this group. Edit or delete those expenses first.`,
    };
  }
  return { valid: true };
}
